import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { parse, id, bookingInput, HttpError } from '../validation.mjs';
import { transaction } from '../db.mjs';
import {
  bookingFields,
  bookingJoins,
  bookingScope,
  getBooking,
  canManageStudio,
  getSlots,
  ensureNoConflict,
  notify,
  audit,
} from '../domain.mjs';
import { paymentMethods, paymentEmail } from '../content.mjs';
export function bookingRoutes(app, { pool }) {
  app.get('/api/bookings', async (req, res) => {
    const scope = bookingScope(req.user);
    const params = [...scope.params];
    let where = scope.clause;
    if (req.query.status) {
      params.push(
        parse(
          z.enum(['pending', 'confirmed', 'declined', 'cancelled', 'completed']),
          req.query.status,
        ),
      );
      where += ` AND b.status=$${params.length}`;
    }
    const bookings = (
      await pool.query(
        `SELECT ${bookingFields} ${bookingJoins} WHERE ${where} ORDER BY b.starts_at DESC LIMIT 200`,
        params,
      )
    ).rows;
    res.json({ bookings });
  });
  app.get('/api/bookings/:id', async (req, res) => {
    const booking = await getBooking(pool, parse(id, req.params.id), req.user);
    const assets = (
      await pool.query(
        "SELECT a.id,a.filename,'/api/assets/'||a.id::text AS url FROM venue_app.booking_assets ba JOIN venue_app.assets a ON a.id=ba.asset_id WHERE ba.booking_id=$1",
        [booking.id],
      )
    ).rows;
    res.json({
      booking,
      assets,
      canManage:
        req.user.role === 'admin' ||
        (req.user.role !== 'client' &&
          (booking.artist_id === req.user.id ||
            (await canManageStudio(pool, booking.studio_id, req.user, 'bookings')))),
    });
  });
  app.post('/api/bookings', async (req, res) => {
    const values = parse(bookingInput, req.body);
    const hash = createHash('sha256')
      .update(JSON.stringify({ ...values, idempotencyKey: undefined }))
      .digest('hex');
    const output = await transaction(pool, async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${req.user.id}:${values.idempotencyKey}`,
      ]);
      const existing = (
        await db.query(
          'SELECT id,reference,status,starts_at,request_hash FROM venue_app.bookings WHERE client_id=$1 AND idempotency_key=$2',
          [req.user.id, values.idempotencyKey],
        )
      ).rows[0];
      if (existing) {
        if (existing.request_hash !== hash)
          throw new HttpError(
            409,
            'This request identifier was used for different information. Please submit again.',
          );
        return { booking: existing, created: false };
      }
      const profile = (
        await db.query(
          'SELECT a.studio_id,st.timezone FROM venue_app.artist_profiles a LEFT JOIN venue_app.studios st ON st.id=a.studio_id WHERE a.user_id=$1',
          [values.artistId],
        )
      ).rows[0];
      if (!profile) throw new HttpError(400, 'Choose an available artist.');
      const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: profile.timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(values.startsAt));
      const availability = await getSlots(db, {
        artistId: values.artistId,
        serviceId: values.serviceId,
        date: day,
        eventId: values.eventId,
      });
      const slot = availability.slots.find(
        (s) => +new Date(s.startsAt) === +new Date(values.startsAt),
      );
      if (!slot)
        throw new HttpError(
          409,
          'That time is no longer available. Please choose another appointment.',
        );
      const service = (
        await db.query(
          'SELECT price_cents,deposit_cents,currency FROM venue_app.services WHERE id=$1',
          [values.serviceId],
        )
      ).rows[0];
      let quote = service.price_cents;
      if (values.flashId) {
        const flash = (
          await db.query(
            'SELECT artist_id,price_cents,published,archived,repeatable FROM venue_app.flash_designs WHERE id=$1 FOR UPDATE',
            [values.flashId],
          )
        ).rows[0];
        if (!flash || flash.artist_id !== values.artistId || !flash.published || flash.archived)
          throw new HttpError(409, 'That artwork is no longer available.');
        if (
          !flash.repeatable &&
          (
            await db.query(
              "SELECT 1 FROM venue_app.bookings WHERE flash_id=$1 AND status IN ('confirmed','completed')",
              [values.flashId],
            )
          ).rowCount
        )
          throw new HttpError(409, 'This artwork has already been booked.');
        quote = flash.price_cents ?? quote;
      }
      const uniqueAssets = [...new Set(values.assetIds)];
      if (uniqueAssets.length) {
        const owned = (
          await db.query(
            'SELECT id FROM venue_app.assets WHERE id=ANY($1::uuid[]) AND owner_id=$2',
            [uniqueAssets, req.user.id],
          )
        ).rows;
        if (owned.length !== uniqueAssets.length)
          throw new HttpError(403, 'One or more reference images do not belong to your account.');
      }
      const record = (
        await db.query(
          'INSERT INTO venue_app.bookings(id,reference,client_id,artist_id,service_id,flash_id,event_id,title,notes,placement,size_note,starts_at,ends_at,quote_cents,deposit_cents,currency,idempotency_key,request_hash,consent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now()) RETURNING id,reference,status,starts_at',
          [
            randomUUID(),
            `VEN-${randomUUID().slice(0, 8).toUpperCase()}`,
            req.user.id,
            values.artistId,
            values.serviceId,
            values.flashId || null,
            values.eventId || null,
            values.title,
            values.notes,
            values.placement,
            values.sizeNote,
            slot.startsAt,
            slot.endsAt,
            quote,
            Math.min(service.deposit_cents, quote ?? service.deposit_cents),
            service.currency,
            values.idempotencyKey,
            hash,
          ],
        )
      ).rows[0];
      for (const assetId of uniqueAssets)
        await db.query('INSERT INTO venue_app.booking_assets(booking_id,asset_id) VALUES($1,$2)', [
          record.id,
          assetId,
        ]);
      await notify(
        db,
        values.artistId,
        'New booking request',
        `${req.user.name}: ${values.title}`,
        record.id,
      );
      await notify(db, req.user.id, 'Your request has been received', record.reference, record.id);
      await audit(db, req.user, 'booking.requested', record.id);
      return { booking: record, created: true };
    });
    res.status(output.created ? 201 : 200).json(output);
  });
  app.patch('/api/bookings/:id', async (req, res) => {
    const bookingId = parse(id, req.params.id);
    const values = parse(
      z
        .object({
          status: z.enum(['confirmed', 'declined', 'cancelled', 'completed']).optional(),
          startsAt: z.iso.datetime({ offset: true }).optional(),
          quoteCents: z.number().int().min(0).max(100000000).nullable().optional(),
          depositCents: z.number().int().min(0).max(100000000).optional(),
          note: z.string().max(1500).optional(),
        })
        .strict()
        .refine((v) => Object.keys(v).length > 0, 'Choose a change to save.'),
      req.body,
    );
    const result = await transaction(pool, async (db) => {
      const booking = await getBooking(db, bookingId, req.user, { lock: true });
      const manager =
        req.user.role === 'admin' ||
        booking.artist_id === req.user.id ||
        booking.studio_owner === req.user.id ||
        (await canManageStudio(db, booking.studio_id, req.user, 'bookings'));
      if (
        !manager &&
        (values.status !== 'cancelled' ||
          Object.keys(values).some((k) => !['status', 'note'].includes(k)))
      )
        throw new HttpError(403, 'Only your artist or studio can make this change.');
      if (['declined', 'cancelled', 'completed'].includes(booking.status))
        throw new HttpError(409, 'This booking is closed.');
      const status = values.status || booking.status;
      if (status === 'completed' && booking.status !== 'confirmed')
        throw new HttpError(409, 'Confirm the appointment before completing it.');
      if (values.quoteCents === null && booking.paid_cents > 0)
        throw new HttpError(409, 'A paid booking must keep its quote.');
      const quote = values.quoteCents === undefined ? booking.quote_cents : values.quoteCents;
      const deposit = values.depositCents ?? booking.deposit_cents;
      if (quote !== null && (deposit > quote || booking.paid_cents > quote))
        throw new HttpError(400, 'The quote cannot be less than the deposit or payments received.');
      const start = values.startsAt || new Date(booking.starts_at).toISOString();
      const end = values.startsAt
        ? new Date(+new Date(start) + booking.duration_minutes * 60000).toISOString()
        : new Date(booking.ends_at).toISOString();
      if (status === 'confirmed' && +new Date(start) <= Date.now())
        throw new HttpError(400, 'Choose a future time for this appointment.');
      if (['confirmed', 'completed'].includes(status)) {
        await ensureNoConflict(db, {
          artistId: booking.artist_id,
          startsAt: start,
          endsAt: end,
          excludeId: booking.id,
        });
        if (booking.flash_id) {
          const flash = (
            await db.query(
              'SELECT repeatable FROM venue_app.flash_designs WHERE id=$1 FOR UPDATE',
              [booking.flash_id],
            )
          ).rows[0];
          if (
            !flash.repeatable &&
            (
              await db.query(
                "SELECT 1 FROM venue_app.bookings WHERE flash_id=$1 AND id<>$2 AND status IN ('confirmed','completed')",
                [booking.flash_id, booking.id],
              )
            ).rowCount
          )
            throw new HttpError(409, 'That artwork has already been confirmed for another client.');
        }
        if (booking.event_id) {
          const event = (
            await db.query(
              'SELECT capacity,starts_at,ends_at FROM venue_app.events WHERE id=$1 FOR UPDATE',
              [booking.event_id],
            )
          ).rows[0];
          if (
            +new Date(start) < +new Date(event.starts_at) ||
            +new Date(end) > +new Date(event.ends_at)
          )
            throw new HttpError(400, 'Choose a time within the event.');
          const count = Number(
            (
              await db.query(
                "SELECT count(*) FROM venue_app.bookings WHERE event_id=$1 AND id<>$2 AND status IN ('confirmed','completed')",
                [booking.event_id, booking.id],
              )
            ).rows[0].count,
          );
          if (count >= event.capacity)
            throw new HttpError(409, 'This event has reached its booking capacity.');
        }
      }
      await db.query(
        'UPDATE venue_app.bookings SET status=$1,starts_at=$2,ends_at=$3,quote_cents=$4,deposit_cents=$5,cancellation_note=$6,updated_at=now() WHERE id=$7',
        [status, start, end, quote, deposit, values.note || booking.cancellation_note, booking.id],
      );
      await notify(
        db,
        booking.client_id,
        'Your booking was updated',
        `${booking.reference}: ${status}`,
        booking.id,
      );
      await audit(db, req.user, 'booking.updated', booking.id, { status });
      return { id: booking.id, status };
    });
    res.json({ booking: result });
  });
  app.get('/api/bookings/:id/messages', async (req, res) => {
    const booking = await getBooking(pool, parse(id, req.params.id), req.user);
    res.json({
      messages: (
        await pool.query(
          'SELECT latest.* FROM (SELECT m.id,m.sender_id,m.body,m.created_at,u.name AS sender_name FROM venue_app.messages m JOIN venue_app.users u ON u.id=m.sender_id WHERE m.booking_id=$1 ORDER BY m.created_at DESC LIMIT 300) latest ORDER BY latest.created_at',
          [booking.id],
        )
      ).rows,
    });
  });
  app.post('/api/bookings/:id/messages', async (req, res) => {
    const booking = await getBooking(pool, parse(id, req.params.id), req.user);
    const { body } = parse(
      z.object({ body: z.string().trim().min(1).max(3000) }).strict(),
      req.body,
    );
    const message = await transaction(pool, async (db) => {
      const message = (
        await db.query(
          'INSERT INTO venue_app.messages(id,booking_id,sender_id,body) VALUES($1,$2,$3,$4) RETURNING id,sender_id,body,created_at',
          [randomUUID(), booking.id, req.user.id, body],
        )
      ).rows[0];
      await notify(
        db,
        req.user.id === booking.client_id ? booking.artist_id : booking.client_id,
        'New booking message',
        `${booking.reference}: ${body.slice(0, 120)}`,
        booking.id,
      );
      await audit(db, req.user, 'message.sent', booking.id);
      return message;
    });
    res.status(201).json({ message: { ...message, sender_name: req.user.name } });
  });
  app.post('/api/checkout', async (req, res) => {
    const values = parse(
      z
        .object({
          bookingId: id,
          method: z.enum(paymentMethods),
          purpose: z.enum(['deposit', 'balance']).default('balance'),
          idempotencyKey: z.string().min(16).max(100),
        })
        .strict(),
      req.body,
    );
    const output = await transaction(pool, async (db) => {
      const booking = await getBooking(db, values.bookingId, req.user, { lock: true });
      if (booking.client_id !== req.user.id)
        throw new HttpError(403, 'Only the client can request payment instructions.');
      if (['cancelled', 'declined'].includes(booking.status))
        throw new HttpError(409, 'This booking is closed.');
      let amount = null;
      const target = values.purpose === 'deposit' ? booking.deposit_cents : booking.quote_cents;
      if (target !== null) {
        amount = Math.max(0, target - booking.paid_cents);
        if (amount === 0)
          throw new HttpError(
            409,
            values.purpose === 'deposit'
              ? 'No deposit is due.'
              : 'This booking has no balance due.',
          );
      }
      const existing = (
        await db.query(
          'SELECT id,method,booking_id,purpose,status,amount_cents FROM venue_app.payment_requests WHERE user_id=$1 AND idempotency_key=$2',
          [req.user.id, values.idempotencyKey],
        )
      ).rows[0];
      if (
        existing &&
        (existing.booking_id !== booking.id ||
          existing.method !== values.method ||
          existing.purpose !== values.purpose ||
          existing.status !== 'requested')
      )
        throw new HttpError(409, 'Please refresh this payment request and try again.');
      let paymentId = existing?.id;
      if (existing) amount = existing.amount_cents;
      if (!paymentId) {
        await db.query(
          "UPDATE venue_app.payment_requests SET status='cancelled' WHERE booking_id=$1 AND user_id=$2 AND status='requested'",
          [booking.id, req.user.id],
        );
        paymentId = randomUUID();
        await db.query(
          'INSERT INTO venue_app.payment_requests(id,booking_id,user_id,method,purpose,amount_cents,currency,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            paymentId,
            booking.id,
            req.user.id,
            values.method,
            values.purpose,
            amount,
            booking.currency,
            values.idempotencyKey,
          ],
        );
        await notify(
          db,
          booking.artist_id,
          'Payment enquiry',
          `${booking.reference}: ${values.method}`,
          booking.id,
        );
        await audit(db, req.user, 'payment.requested', paymentId, { method: values.method });
      }
      const amountText =
        amount === null
          ? 'Please provide a quote'
          : (amount / 100).toFixed(2) + ' ' + booking.currency;
      const purposeLabel =
        values.purpose === 'deposit' ? 'Booking deposit' : 'Remaining booking balance';
      const appointment = new Intl.DateTimeFormat('en-GB', {
        timeZone: booking.timezone || 'UTC',
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(booking.starts_at));
      const subject = purposeLabel + ' · ' + booking.reference + ' · ' + values.method;
      const lines = [
        'Hello,',
        '',
        'I would like to arrange payment for the booking below.',
        '',
        'Booking reference: ' + booking.reference,
        'Payment reference: ' + paymentId,
        'Payment method: ' + values.method,
        'Payment purpose: ' + values.purpose,
        'Paying for: ' + purposeLabel,
        'Amount: ' + amountText,
        '',
        'Service: ' + booking.service_name,
        'Artwork / request: ' + booking.title,
        'Artist: ' + booking.artist_name,
        'Studio: ' + booking.studio_name,
        'Appointment: ' + appointment + ' (' + (booking.timezone || 'UTC') + ')',
        ...(booking.placement ? ['Placement: ' + booking.placement] : []),
        ...(booking.size_note ? ['Size: ' + booking.size_note] : []),
        '',
        'Client: ' + req.user.name,
        'Email: ' + req.user.email,
        '',
        'Please send the payment instructions for my selected method and confirm the next steps.',
        'Thank you.',
      ];
      const details = lines.join('\n');
      return {
        payment: {
          id: paymentId,
          status: 'requested',
          amount_cents: amount,
          currency: booking.currency,
          method: values.method,
        },
        recipient: paymentEmail,
        subject,
        webmail: {
          gmail:
            'https://mail.google.com/mail/?' +
            new URLSearchParams({
              view: 'cm',
              fs: '1',
              to: paymentEmail,
              su: subject,
              body: details,
            }),
          outlook:
            'https://outlook.live.com/mail/0/deeplink/compose?' +
            new URLSearchParams({ to: paymentEmail, subject, body: details }),
        },
        details,
        mailto:
          'mailto:' +
          paymentEmail +
          '?subject=' +
          encodeURIComponent(subject) +
          '&body=' +
          encodeURIComponent(details),
      };
    });
    res.status(201).json(output);
  });
  app.get('/api/payments', async (req, res) => {
    const scope = bookingScope(req.user, 1, 'payments');
    const readable = new Set(
      (
        await pool.query(
          "SELECT studio_id FROM venue_app.studio_access WHERE user_id=$1 AND access_role IN ('manager','receptionist')",
          [req.user.id],
        )
      ).rows.map((r) => r.studio_id),
    );
    const payments = (
      await pool.query(
        `SELECT p.id,p.booking_id,p.user_id,p.method,p.purpose,p.amount_cents,p.currency,p.status,p.receipt_reference,p.created_at,p.received_at,(SELECT COALESCE(sum(r.amount_cents),0)::integer FROM venue_app.refunds r WHERE r.payment_id=p.id AND r.status='succeeded') AS refunded_cents,b.reference,b.title,u.name AS client_name,st.id AS studio_id,b.artist_id,st.owner_id AS studio_owner FROM venue_app.payment_requests p JOIN venue_app.bookings b ON b.id=p.booking_id JOIN venue_app.users u ON u.id=b.client_id JOIN venue_app.artist_profiles a ON a.user_id=b.artist_id LEFT JOIN venue_app.studios st ON st.id=a.studio_id WHERE ${scope.clause} ORDER BY p.created_at DESC LIMIT 200`,
        scope.params,
      )
    ).rows.map((p) => ({
      ...p,
      can_open_booking:
        req.user.role === 'admin' ||
        p.user_id === req.user.id ||
        p.artist_id === req.user.id ||
        p.studio_owner === req.user.id ||
        readable.has(p.studio_id),
    }));
    res.json({ payments });
  });
  app.patch('/api/payments/:id', async (req, res) => {
    const paymentId = parse(id, req.params.id);
    const values = parse(
      z
        .object({
          status: z.enum(['received', 'cancelled']),
          receiptReference: z.string().trim().min(3).max(200),
          amountCents: z.number().int().positive().max(100000000).optional(),
        })
        .strict(),
      req.body,
    );
    await transaction(pool, async (db) => {
      const metadata = (
        await db.query('SELECT booking_id FROM venue_app.payment_requests WHERE id=$1', [paymentId])
      ).rows[0];
      if (!metadata) throw new HttpError(404, 'Payment request not found.');
      const booking = await getBooking(db, metadata.booking_id, req.user, {
        lock: true,
        manage: true,
        permission: 'payments',
      });
      const payment = (
        await db.query(
          'SELECT id,booking_id,status,amount_cents FROM venue_app.payment_requests WHERE id=$1 FOR UPDATE',
          [paymentId],
        )
      ).rows[0];
      if (payment.status !== 'requested')
        throw new HttpError(409, 'This payment request has already been processed.');
      const amount = values.amountCents ?? payment.amount_cents;
      if (
        values.status === 'received' &&
        (!amount ||
          booking.quote_cents === null ||
          amount > booking.quote_cents - booking.paid_cents)
      )
        throw new HttpError(
          400,
          'Set a quote and enter an amount no greater than the outstanding balance.',
        );
      await db.query(
        "UPDATE venue_app.payment_requests SET status=$1,receipt_reference=$2,amount_cents=$3,recorded_by=$4,received_at=CASE WHEN $1='received' THEN now() ELSE NULL END WHERE id=$5",
        [values.status, values.receiptReference, amount, req.user.id, paymentId],
      );
      await notify(
        db,
        booking.client_id,
        values.status === 'received' ? 'Payment received' : 'Payment request updated',
        booking.reference,
        booking.id,
      );
      await audit(db, req.user, 'payment.recorded', paymentId, {
        status: values.status,
        amountCents: amount,
      });
    });
    res.json({ ok: true });
  });
}
