import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { HttpError, parse, id } from '../validation.mjs';
import { getBooking, audit, notify } from '../domain.mjs';
import { transaction } from '../db.mjs';

export function cardWebhook(app, { pool, stripe, webhookSecret }) {
  app.post(
    '/api/webhooks/stripe',
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req, res) => {
      if (!stripe || !webhookSecret)
        return res.status(503).json({ message: 'Card payments are not configured.' });
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.get('stripe-signature'),
          webhookSecret,
        );
      } catch {
        return res.status(400).json({ message: 'Invalid webhook signature.' });
      }
      try {
        if (
          ['refund.updated', 'refund.created', 'refund.failed'].includes(event.type) &&
          event.data.object.payment_intent
        ) {
          const intentId = String(event.data.object.payment_intent);
          const receipt = (
            await pool.query(
              'SELECT id FROM venue_app.payment_requests WHERE provider_payment_id=$1',
              [intentId],
            )
          ).rowCount;
          if (!receipt) {
            const intent = await stripe.paymentIntents.retrieve(intentId);
            if (intent.metadata?.venueCheckoutId)
              return res.status(503).json({
                message: 'The payment receipt must be recorded before its refund. Retry delivery.',
              });
          }
        }
        await transaction(pool, async (db) => {
          await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
            'stripe:' + event.id,
          ]);
          if (
            (await db.query('SELECT id FROM venue_app.provider_events WHERE id=$1', [event.id]))
              .rowCount
          )
            return;
          const session = event.data.object;
          if (
            ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
              event.type,
            ) &&
            session.payment_status === 'paid'
          ) {
            const local = (
              await db.query('SELECT * FROM venue_app.card_checkouts WHERE stripe_session_id=$1', [
                session.id,
              ])
            ).rows[0];
            if (!local) {
              if (!session.metadata?.checkoutId) return;
              throw new Error('Unknown checkout');
            }
            const booking = await getBooking(
              db,
              local.booking_id,
              { role: 'admin' },
              { lock: true },
            );
            if (
              session.amount_total !== local.amount_cents ||
              session.currency?.toUpperCase() !== local.currency ||
              !session.payment_intent
            )
              throw new Error('Checkout mismatch');
            if (local.state !== 'paid') {
              // Store every provider-confirmed receipt, even if a late capture needs staff reconciliation.
              const paymentId = randomUUID();
              await db.query(
                "INSERT INTO venue_app.payment_requests(id,booking_id,user_id,method,purpose,amount_cents,currency,status,receipt_reference,idempotency_key,received_at,provider_payment_id) VALUES($1,$2,$3,'Card (Stripe)',$4,$5,$6,'received',$7,$8,now(),$7)",
                [
                  paymentId,
                  local.booking_id,
                  local.user_id,
                  local.purpose,
                  local.amount_cents,
                  local.currency,
                  String(session.payment_intent),
                  'stripe:' + local.id,
                ],
              );
              await db.query("UPDATE venue_app.card_checkouts SET state='paid' WHERE id=$1", [
                local.id,
              ]);
              await notify(
                db,
                local.user_id,
                'Card payment received',
                booking.reference,
                booking.id,
              );
              await audit(db, null, 'card.received', paymentId, {
                booking: booking.reference,
                amountCents: local.amount_cents,
                reconciliation:
                  booking.paid_cents + local.amount_cents > booking.quote_cents ||
                  ['cancelled', 'declined'].includes(booking.status),
              });
            }
          }
          if (event.type === 'checkout.session.expired')
            await db.query(
              "UPDATE venue_app.card_checkouts SET state='expired' WHERE stripe_session_id=$1 AND state<>'paid'",
              [session.id],
            );
          if (['refund.updated', 'refund.created', 'refund.failed'].includes(event.type)) {
            const status =
              session.status === 'succeeded'
                ? 'succeeded'
                : session.status === 'failed' || session.status === 'canceled'
                  ? 'failed'
                  : 'pending';
            const payment = (
              await db.query(
                'SELECT id,booking_id FROM venue_app.payment_requests WHERE provider_payment_id=$1',
                [String(session.payment_intent)],
              )
            ).rows[0];
            if (payment) {
              const refundId = session.metadata?.venueRefundId;
              let existing = (
                await db.query('SELECT id,status FROM venue_app.refunds WHERE provider_id=$1', [
                  session.id,
                ])
              ).rows[0];
              if (!existing && refundId && /^[0-9a-f-]{36}$/.test(refundId))
                existing = (
                  await db.query(
                    'SELECT id,status FROM venue_app.refunds WHERE id=$1 AND payment_id=$2 AND amount_cents=$3 AND provider_id IS NULL',
                    [refundId, payment.id, session.amount],
                  )
                ).rows[0];
              if (existing) {
                // Out-of-order notifications cannot reverse a successful refund.
                await db.query(
                  "UPDATE venue_app.refunds SET provider_id=$1,status=CASE WHEN status='succeeded' THEN status ELSE $2 END,succeeded_at=CASE WHEN $2='succeeded' THEN COALESCE(succeeded_at,now()) ELSE succeeded_at END WHERE id=$3",
                  [session.id, status, existing.id],
                );
              } else {
                await db.query(
                  "INSERT INTO venue_app.refunds(id,payment_id,amount_cents,reason,provider_id,status,request_key,succeeded_at) VALUES($1,$2,$3,'Refund recorded by payment provider',$4,$5,$6,CASE WHEN $5='succeeded' THEN now() ELSE NULL END) ON CONFLICT(provider_id) DO NOTHING",
                  [
                    randomUUID(),
                    payment.id,
                    session.amount,
                    session.id,
                    status,
                    'stripe-external:' + session.id,
                  ],
                );
              }
              await audit(db, null, 'refund.updated', payment.id, {
                status,
                amountCents: session.amount,
              });
            }
          }
          await db.query('INSERT INTO venue_app.provider_events(id,type) VALUES($1,$2)', [
            event.id,
            event.type,
          ]);
        });
        res.json({ received: true });
      } catch {
        // Retryable failure; the provider will redeliver. Never acknowledge a lost ledger write.
        res.status(503).json({ message: 'The event could not be recorded. Retry delivery.' });
      }
    },
  );
}
export function cardRoutes(app, { pool, stripe, siteUrl }) {
  const enabled = (_req, _res, next) =>
    stripe ? next() : next(new HttpError(503, 'Card payments are not configured.'));
  app.post('/api/cards/checkout', enabled, async (req, res) => {
    const v = parse(
      z
        .object({
          bookingId: id,
          purpose: z.enum(['deposit', 'balance']),
          idempotencyKey: z.string().min(16).max(100),
        })
        .strict(),
      req.body,
    );
    const checkout = await transaction(pool, async (db) => {
      const b = await getBooking(db, v.bookingId, req.user, { lock: true });
      if (b.client_id !== req.user.id)
        throw new HttpError(403, 'Only the client can pay for this booking.');
      const existing = (
        await db.query(
          'SELECT * FROM venue_app.card_checkouts WHERE user_id=$1 AND request_key=$2',
          [req.user.id, v.idempotencyKey],
        )
      ).rows[0];
      if (existing) {
        if (existing.booking_id !== b.id || existing.purpose !== v.purpose)
          throw new HttpError(409, 'Use a new checkout request.');
        if (['paid', 'expired'].includes(existing.state))
          throw new HttpError(409, 'This checkout is closed. Refresh to continue.');
        return existing;
      }
      if (['cancelled', 'declined'].includes(b.status) || b.quote_cents === null)
        throw new HttpError(409, 'An open booking with a quote is required.');
      const active = (
        await db.query(
          "SELECT id FROM venue_app.card_checkouts WHERE booking_id=$1 AND state IN ('creating','open') AND expires_at>now()",
          [b.id],
        )
      ).rowCount;
      if (active) throw new HttpError(409, 'Finish or cancel the existing card checkout first.');
      const amount = (v.purpose === 'deposit' ? b.deposit_cents : b.quote_cents) - b.paid_cents;
      if (amount < 50)
        throw new HttpError(
          409,
          'The amount due is below the card minimum of 0.50 USD. Use a manual payment method.',
        );
      return (
        await db.query(
          'INSERT INTO venue_app.card_checkouts(id,booking_id,user_id,purpose,amount_cents,currency,request_key,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            randomUUID(),
            b.id,
            req.user.id,
            v.purpose,
            amount,
            b.currency,
            v.idempotencyKey,
            new Date(Date.now() + 31 * 60000),
          ],
        )
      ).rows[0];
    });
    if (checkout.checkout_url) return res.json({ url: checkout.checkout_url, id: checkout.id });
    try {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'],
          client_reference_id: checkout.id,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: checkout.currency.toLowerCase(),
                unit_amount: checkout.amount_cents,
                product_data: { name: 'Venue booking ' + checkout.purpose },
              },
            },
          ],
          success_url: siteUrl + '/bookings/' + checkout.booking_id + '?payment=processing',
          cancel_url: siteUrl + '/bookings/' + checkout.booking_id + '?payment=cancelled',
          expires_at: Math.floor(new Date(checkout.expires_at).getTime() / 1000),
          metadata: { checkoutId: checkout.id },
          payment_intent_data: { metadata: { venueCheckoutId: checkout.id } },
        },
        { idempotencyKey: 'venue-checkout-' + checkout.id },
      );
      const url = new URL(session.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com')
        throw new Error('Invalid checkout URL');
      await pool.query(
        "UPDATE venue_app.card_checkouts SET stripe_session_id=$1,checkout_url=$2,state='open' WHERE id=$3 AND state='creating'",
        [session.id, session.url, checkout.id],
      );
      res.json({ url: session.url, id: checkout.id });
    } catch {
      throw new HttpError(503, 'Card checkout could not be prepared. Retry this same request.');
    }
  });
  app.get('/api/cards/checkouts/:bookingId', async (req, res) => {
    const b = await getBooking(pool, parse(id, req.params.bookingId), req.user);
    res.json({
      checkouts: (
        await pool.query(
          "SELECT id,state,purpose,amount_cents,currency,checkout_url,expires_at FROM venue_app.card_checkouts WHERE booking_id=$1 AND state IN ('creating','open') AND expires_at>now() ORDER BY created_at DESC",
          [b.id],
        )
      ).rows,
    });
  });
  app.post('/api/cards/checkouts/:id/cancel', enabled, async (req, res) => {
    const checkout = (
      await pool.query('SELECT * FROM venue_app.card_checkouts WHERE id=$1', [
        parse(id, req.params.id),
      ])
    ).rows[0];
    if (!checkout) throw new HttpError(404, 'Checkout not found.');
    const b = await getBooking(pool, checkout.booking_id, req.user);
    if (b.client_id !== req.user.id && req.user.role !== 'admin')
      throw new HttpError(403, 'Only the client or administrator can cancel this checkout.');
    if (checkout.state === 'paid') throw new HttpError(409, 'This checkout was paid.');
    if (!checkout.stripe_session_id)
      throw new HttpError(409, 'Checkout is still being prepared. Retry it or wait for expiry.');
    try {
      await stripe.checkout.sessions.expire(checkout.stripe_session_id);
    } catch {
      throw new HttpError(
        409,
        'The checkout could not be cancelled. Refresh to check its payment status.',
      );
    }
    await pool.query(
      "UPDATE venue_app.card_checkouts SET state='expired' WHERE id=$1 AND state<>'paid'",
      [checkout.id],
    );
    res.json({ ok: true });
  });
  app.get('/api/cards/refunds/:bookingId', async (req, res) => {
    const b = await getBooking(pool, parse(id, req.params.bookingId), req.user);
    res.json({
      refunds: (
        await pool.query(
          'SELECT r.id,r.amount_cents,r.reason,r.status,r.created_at,r.provider_id FROM venue_app.refunds r JOIN venue_app.payment_requests p ON p.id=r.payment_id WHERE p.booking_id=$1 ORDER BY r.created_at',
          [b.id],
        )
      ).rows,
    });
  });
  const saveRefund = async (req, res) => {
    if (req.user.role !== 'admin')
      throw new HttpError(403, 'An administrator must authorize refunds.');
    const retry = req.params.id
      ? (
          await pool.query(
            'SELECT payment_id AS "paymentId",amount_cents AS "amountCents",reason,request_key AS "idempotencyKey" FROM venue_app.refunds WHERE id=$1',
            [parse(id, req.params.id)],
          )
        ).rows[0]
      : null;
    if (req.params.id && !retry) throw new HttpError(404, 'Refund not found.');
    const v = parse(
      z
        .object({
          paymentId: id,
          amountCents: z.number().int().min(1).max(100000000),
          reason: z.string().trim().min(10).max(500),
          idempotencyKey: z.string().min(16).max(100),
        })
        .strict(),
      retry || req.body,
    );
    const refund = await transaction(pool, async (db) => {
      const p = (
        await db.query(
          "SELECT * FROM venue_app.payment_requests WHERE id=$1 AND status='received' FOR UPDATE",
          [v.paymentId],
        )
      ).rows[0];
      if (!p?.provider_payment_id) throw new HttpError(400, 'Choose a received card payment.');
      const existing = (
        await db.query('SELECT * FROM venue_app.refunds WHERE request_key=$1', [v.idempotencyKey])
      ).rows[0];
      if (existing) {
        if (
          existing.payment_id !== p.id ||
          existing.amount_cents !== v.amountCents ||
          existing.reason !== v.reason
        )
          throw new HttpError(409, 'Use a new refund request.');
        return { ...existing, provider_payment_id: p.provider_payment_id };
      }
      const reserved = Number(
        (
          await db.query(
            "SELECT COALESCE(sum(amount_cents),0) AS total FROM venue_app.refunds WHERE payment_id=$1 AND status IN ('pending','succeeded')",
            [p.id],
          )
        ).rows[0].total,
      );
      if (v.amountCents > p.amount_cents - reserved)
        throw new HttpError(400, 'Refund exceeds the remaining received amount.');
      const result = (
        await db.query(
          'INSERT INTO venue_app.refunds(id,payment_id,amount_cents,reason,request_key,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [randomUUID(), p.id, v.amountCents, v.reason, v.idempotencyKey, req.user.id],
        )
      ).rows[0];
      await audit(db, req.user, 'refund.requested', result.id, { amountCents: v.amountCents });
      return { ...result, provider_payment_id: p.provider_payment_id };
    });
    if (refund.provider_id) return res.json({ refund });
    try {
      const result = await stripe.refunds.create(
        {
          payment_intent: refund.provider_payment_id,
          amount: refund.amount_cents,
          metadata: { venueRefundId: refund.id },
        },
        { idempotencyKey: 'venue-refund-' + refund.id },
      );
      const status =
        result.status === 'succeeded'
          ? 'succeeded'
          : result.status === 'failed' || result.status === 'canceled'
            ? 'failed'
            : 'pending';
      await pool.query(
        "UPDATE venue_app.refunds SET provider_id=$1,status=CASE WHEN status='succeeded' THEN status ELSE $2 END,succeeded_at=CASE WHEN $2='succeeded' THEN COALESCE(succeeded_at,now()) ELSE succeeded_at END WHERE id=$3",
        [result.id, status, refund.id],
      );
      res.json({ refund: { id: refund.id, status } });
    } catch {
      throw new HttpError(503, 'The refund could not be confirmed. Retry this same request.');
    }
  };
  app.post('/api/cards/refunds', enabled, saveRefund);
  app.post('/api/cards/refunds/:id/retry', enabled, saveRefund);
}
