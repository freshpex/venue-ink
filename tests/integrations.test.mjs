import { beforeAll, afterAll, it, expect } from 'vitest';
import supertest from 'supertest';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers/platform.mjs';
import { createApp } from '../server/app.mjs';
let f,
  cardApp,
  cardClient,
  cardAdmin,
  bookingId,
  checkoutId,
  stripeSession,
  createCalls = 0,
  refundCalls = 0,
  createdPayment;
const origin = 'http://127.0.0.1:5173',
  siteUrl = 'http://127.0.0.1:4173';
const webhookSecret = 'whsec_integration_test';
const sdk = new Stripe('sk_test_fake_key_no_network');
const stripe = {
  webhooks: sdk.webhooks,
  checkout: {
    sessions: {
      async create(data, options) {
        createCalls++;
        stripeSession = {
          id: 'cs_test_' + randomUUID(),
          url: 'https://checkout.stripe.com/c/pay/test',
          ...data,
          idempotencyKey: options.idempotencyKey,
        };
        return stripeSession;
      },
      async expire() {
        return { status: 'expired' };
      },
    },
  },
  refunds: {
    async create(_data, options) {
      refundCalls++;
      return { id: 're_test_' + options.idempotencyKey, status: 'succeeded' };
    },
  },
};
beforeAll(async () => {
  f = await fixture();
  cardApp = createApp({
    pool: f.pool,
    secret: 'venue-card-tests-secret-at-least-32-characters',
    origins: [origin],
    siteUrl,
    stripe,
    webhookSecret,
    limit: 1000,
  });
  cardClient = supertest.agent(cardApp);
  cardAdmin = supertest.agent(cardApp);
  const admin = (await f.admin.get('/api/auth/me')).body.user;
  for (const [agent, email] of [
    [cardClient, f.client.email],
    [cardAdmin, admin.email],
  ])
    expect(
      (await f.mutation(agent.post('/api/auth/login')).send({ email, password: f.client.password }))
        .status,
    ).toBe(200);
  const booking = await f
    .mutation(f.client.agent.post('/api/bookings'))
    .send({ ...f.bookingInput, idempotencyKey: randomUUID() });
  bookingId = booking.body.booking.id;
}, 60000);
afterAll(async () => {
  await f?.cleanup();
}, 60000);
function webhook(event, signature) {
  const payload = JSON.stringify(event);
  return supertest(cardApp)
    .post('/api/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set(
      'stripe-signature',
      signature || sdk.webhooks.generateTestHeaderString({ payload, secret: webhookSecret }),
    )
    .send(payload);
}
it('creates a hosted checkout, reuses retries and reserves the booking against conflicting quotes or manual receipts', async () => {
  const key = randomUUID(),
    data = { bookingId, purpose: 'deposit', idempotencyKey: key };
  expect((await f.mutation(cardAdmin.post('/api/cards/checkout')).send(data)).status).toBe(403);
  const first = await f.mutation(cardClient.post('/api/cards/checkout')).send(data);
  expect(first.status, JSON.stringify(first.body)).toBe(200);
  checkoutId = first.body.id;
  expect(first.body.url).toContain('https://checkout.stripe.com/');
  expect(stripeSession.line_items[0].price_data.unit_amount).toBe(3000);
  expect((await f.mutation(cardClient.post('/api/cards/checkout')).send(data)).body.id).toBe(
    checkoutId,
  );
  expect(createCalls).toBe(1);
  expect(
    (
      await f
        .mutation(cardClient.post('/api/cards/checkout'))
        .send({ ...data, idempotencyKey: randomUUID(), purpose: 'balance' })
    ).status,
  ).toBe(409);
  expect(
    (
      await f
        .mutation(f.artist.agent.patch('/api/bookings/' + bookingId))
        .send({ quoteCents: 20000 })
    ).status,
  ).toBe(409);
  const enquiry = await f
    .mutation(f.client.agent.post('/api/checkout'))
    .send({ bookingId, method: 'PayPal', purpose: 'deposit', idempotencyKey: randomUUID() });
  expect(enquiry.status).toBe(201);
  expect(
    (
      await f
        .mutation(f.admin.patch('/api/payments/' + enquiry.body.payment.id))
        .send({ status: 'received', amountCents: 3000, receiptReference: 'manual-receipt' })
    ).status,
  ).toBe(409);
});
it('requires signed webhooks and records a provider-confirmed payment exactly once', async () => {
  const event = {
    id: 'evt_test_' + randomUUID(),
    type: 'checkout.session.completed',
    data: {
      object: {
        id: stripeSession.id,
        payment_status: 'paid',
        amount_total: 3000,
        currency: 'usd',
        payment_intent: 'pi_test_' + randomUUID(),
      },
    },
  };
  expect((await webhook(event, 'invalid')).status).toBe(400);
  expect(
    (
      await webhook({
        ...event,
        id: 'evt_bad_' + randomUUID(),
        data: { object: { ...event.data.object, amount_total: 999 } },
      })
    ).status,
  ).toBe(503);
  const [a, b] = await Promise.all([webhook(event), webhook(event)]);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  const payments = (
    await f.pool.query(
      'SELECT * FROM venue_app.payment_requests WHERE booking_id=$1 AND provider_payment_id IS NOT NULL',
      [bookingId],
    )
  ).rows;
  expect(payments).toHaveLength(1);
  createdPayment = payments[0];
  expect((await f.client.agent.get('/api/bookings/' + bookingId)).body.booking.paid_cents).toBe(
    3000,
  );
  expect(
    (await f.pool.query('SELECT state FROM venue_app.card_checkouts WHERE id=$1', [checkoutId]))
      .rows[0].state,
  ).toBe('paid');
});
it('permits only administrators to issue bounded idempotent refunds and subtracts completed refunds from net receipts', async () => {
  const data = {
    paymentId: createdPayment.id,
    amountCents: 1000,
    reason: 'Client requested a partial refund.',
    idempotencyKey: randomUUID(),
  };
  expect((await f.mutation(cardClient.post('/api/cards/refunds')).send(data)).status).toBe(403);
  const result = await f.mutation(cardAdmin.post('/api/cards/refunds')).send(data);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  expect(result.body.refund.status).toBe('succeeded');
  expect((await f.mutation(cardAdmin.post('/api/cards/refunds')).send(data)).status).toBe(200);
  expect(refundCalls).toBe(1);
  expect((await f.client.agent.get('/api/bookings/' + bookingId)).body.booking.paid_cents).toBe(
    2000,
  );
  expect(
    (
      await f
        .mutation(cardAdmin.post('/api/cards/refunds'))
        .send({ ...data, idempotencyKey: randomUUID(), amountCents: 3000 })
    ).status,
  ).toBe(400);
});
it('reconciles out-of-order provider refunds and can retry a reserved refund after a browser reload', async () => {
  const original = (
    await f.pool.query('SELECT provider_id FROM venue_app.refunds WHERE payment_id=$1', [
      createdPayment.id,
    ])
  ).rows[0];
  const stale = {
    id: 'evt_stale_' + randomUUID(),
    type: 'refund.updated',
    data: {
      object: {
        id: original.provider_id,
        payment_intent: createdPayment.provider_payment_id,
        amount: 1000,
        status: 'pending',
      },
    },
  };
  expect((await webhook(stale)).status).toBe(200);
  expect((await f.client.agent.get('/api/bookings/' + bookingId)).body.booking.paid_cents).toBe(
    2000,
  );
  const external = {
    id: 'evt_external_' + randomUUID(),
    type: 'refund.created',
    data: {
      object: {
        id: 're_external_' + randomUUID(),
        payment_intent: createdPayment.provider_payment_id,
        amount: 500,
        status: 'succeeded',
      },
    },
  };
  expect((await webhook(external)).status).toBe(200);
  expect((await f.client.agent.get('/api/bookings/' + bookingId)).body.booking.paid_cents).toBe(
    1500,
  );
  const pendingId = randomUUID(),
    adminId = (await f.admin.get('/api/auth/me')).body.user.id;
  await f.pool.query(
    'INSERT INTO venue_app.refunds(id,payment_id,amount_cents,reason,request_key,created_by) VALUES($1,$2,100,$3,$4,$5)',
    [pendingId, createdPayment.id, 'Retry an interrupted provider request.', randomUUID(), adminId],
  );
  const retry = await f
    .mutation(cardAdmin.post('/api/cards/refunds/' + pendingId + '/retry'))
    .send({});
  expect(retry.status, JSON.stringify(retry.body)).toBe(200);
  expect((await f.client.agent.get('/api/bookings/' + bookingId)).body.booking.paid_cents).toBe(
    1400,
  );
});

it('delegates studio-specific reception and finance privileges and revokes them immediately', async () => {
  const staff = await f.account('studio');
  expect((await staff.agent.get('/api/bookings/' + bookingId)).status).toBe(404);
  const grant = { studioId: f.studio.id, email: staff.email, accessRole: 'receptionist' };
  expect((await f.mutation(f.client.agent.put('/api/team/access')).send(grant)).status).toBe(403);
  expect((await f.mutation(f.artist.agent.put('/api/team/access')).send(grant)).status).toBe(200);
  expect((await staff.agent.get('/api/bookings/' + bookingId)).status).toBe(200);
  expect(
    (await staff.agent.get('/api/bookings-search')).body.bookings.some((b) => b.id === bookingId),
  ).toBe(true);
  expect(
    (
      await f
        .mutation(staff.agent.post('/api/bookings/' + bookingId + '/messages'))
        .send({ body: 'Your appointment is ready for review.' })
    ).status,
  ).toBe(201);
  expect(
    (
      await f
        .mutation(staff.agent.patch('/api/payments/' + createdPayment.id))
        .send({ status: 'received', receiptReference: 'not-allowed' })
    ).status,
  ).toBe(404);
  expect(
    (
      await f
        .mutation(staff.agent.put('/api/team/access'))
        .send({ ...grant, accessRole: 'manager' })
    ).status,
  ).toBe(403);
  expect(
    (
      await f
        .mutation(f.artist.agent.put('/api/team/access'))
        .send({ ...grant, accessRole: 'finance' })
    ).status,
  ).toBe(200);
  expect((await staff.agent.get('/api/bookings/' + bookingId + '/messages')).status).toBe(404);
  expect(
    (await staff.agent.get('/api/payments')).body.payments.find((p) => p.id === createdPayment.id)
      .can_open_booking,
  ).toBe(false);
  expect(
    (await staff.agent.get('/api/payments')).body.payments.some((p) => p.id === createdPayment.id),
  ).toBe(true);
  expect(
    (
      await f.mutation(
        f.artist.agent.delete('/api/team/access/' + f.studio.id + '/' + staff.user.id),
      )
    ).status,
  ).toBe(200);
  expect(
    (await staff.agent.get('/api/payments')).body.payments.some((p) => p.id === createdPayment.id),
  ).toBe(false);
});
it('uses an organization OIDC identity only after state verification and never provisions accounts from provider role claims', async () => {
  const account = await f.account('client');
  let claims = {
    iss: 'https://identity.venue.test',
    sub: 'external-' + randomUUID(),
    email: account.email,
    email_verified: true,
    role: 'admin',
  };
  const provider = {
    async start(flow) {
      return 'https://identity.venue.test/authorize?state=' + flow.state;
    },
    async finish(_url, flow) {
      expect(flow.verifier).toBeTruthy();
      expect(flow.nonce).toBeTruthy();
      return claims;
    },
  };
  const app = createApp({
    pool: f.pool,
    secret: 'venue-sso-tests-secret-at-least-32-characters',
    origins: [origin],
    siteUrl,
    oidcProvider: provider,
    oidcDomains: ['venue.test'],
    limit: 1000,
  });
  const agent = supertest.agent(app);
  const start = await agent.get('/api/auth/sso/start');
  expect(start.status).toBe(302);
  let state;
  expect(
    (await agent.get('/api/auth/sso/callback').query({ state: 'bad', code: 'example' })).headers
      .location,
  ).toContain('sso=error');
  expect((await agent.get('/api/auth/me')).status).toBe(401);
  const next = await agent.get('/api/auth/sso/start');
  state = new URL(next.headers.location).searchParams.get('state');
  expect(
    (await agent.get('/api/auth/sso/callback').query({ state, code: 'example' })).headers.location,
  ).toBe(siteUrl + '/dashboard');
  expect((await agent.get('/api/auth/me')).body.user.role).toBe('client');
  // A verified email not already provisioned locally cannot create an account.
  claims = { ...claims, sub: 'unprovisioned', email: 'unprovisioned@venue.test' };
  const unknown = supertest.agent(app);
  const unknownStart = await unknown.get('/api/auth/sso/start');
  state = new URL(unknownStart.headers.location).searchParams.get('state');
  expect(
    (await unknown.get('/api/auth/sso/callback').query({ state, code: 'example' })).headers
      .location,
  ).toContain('sso=error');
  expect((await unknown.get('/api/auth/me')).status).toBe(401);
});
