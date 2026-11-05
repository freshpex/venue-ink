import { beforeAll, afterAll, it, expect } from 'vitest';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers/platform.mjs';
import { createApp } from '../server/app.mjs';
let f, bookingId, createdPayment;
const origin = 'http://127.0.0.1:5173',
  siteUrl = 'http://127.0.0.1:4173';
beforeAll(async () => {
  f = await fixture();
  const booking = await f
    .mutation(f.client.agent.post('/api/bookings'))
    .send({ ...f.bookingInput, idempotencyKey: randomUUID() });
  expect(booking.status).toBe(201);
  bookingId = booking.body.booking.id;
  const payment = await f
    .mutation(f.client.agent.post('/api/checkout'))
    .send({ bookingId, method: 'PayPal', purpose: 'deposit', idempotencyKey: randomUUID() });
  expect(payment.status).toBe(201);
  createdPayment = payment.body.payment;
}, 60000);
afterAll(async () => {
  await f?.cleanup();
}, 60000);
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
