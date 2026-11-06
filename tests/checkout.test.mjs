import { beforeAll, afterAll, it, expect } from 'vitest';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/platform.mjs';
let f, booking;
beforeAll(async () => {
  f = await fixture();
  const response = await f
    .mutation(f.client.agent.post('/api/bookings'))
    .send({ ...f.bookingInput, idempotencyKey: randomUUID() });
  expect(response.status).toBe(201);
  booking = response.body.booking;
}, 60000);
afterAll(async () => {
  await f?.cleanup();
}, 60000);
async function checkout(purpose, method = 'PayPal', key = randomUUID()) {
  return f
    .mutation(f.client.agent.post('/api/checkout'))
    .send({ bookingId: booking.id, purpose, method, idempotencyKey: key });
}
it('prepares each supported method for the correct recipient with the selected booking details', async () => {
  const methods = (await supertest(f.app).get('/api/site')).body.paymentMethods;
  expect(methods.length).toBeGreaterThan(5);
  for (const method of methods) {
    const response = await checkout('deposit', method);
    expect(response.status).toBe(201);
    const result = response.body,
      url = new URL(result.mailto);
    expect(url.pathname).toBe('carlytatts@gmail.com');
    expect(url.searchParams.get('subject')).toContain(method);
    const body = url.searchParams.get('body');
    expect(body).toBe(result.details);
    for (const text of [
      'Paying for: Booking deposit',
      'Amount: 30.00 USD',
      'Payment method: ' + method,
      'Service: QA Consultation',
      'Artwork / request: Botanical linework',
      'Artist: QA Artist',
      'Studio: ' + f.studio.name,
      'Client: ' + f.client.user.name,
      'Email: ' + f.client.email,
      'Placement: Forearm',
      'Size: 10 cm',
      '(Europe/Amsterdam)',
    ])
      expect(body).toContain(text);
    expect(url.search).not.toContain('+');
    expect(result.payment.status).toBe('requested');
    const gmail = new URL(result.webmail.gmail),
      outlook = new URL(result.webmail.outlook);
    expect(gmail.hostname).toBe('mail.google.com');
    expect(gmail.searchParams.get('to')).toBe('carlytatts@gmail.com');
    expect(gmail.searchParams.get('body')).toBe(body);
    expect(outlook.searchParams.get('to')).toBe('carlytatts@gmail.com');
    expect(outlook.searchParams.get('subject')).toBe(result.subject);
  }
});
it('uses the remaining amount for balance or deposit and never marks an enquiry as paid', async () => {
  const initial = await checkout('balance');
  expect(initial.body.details).toContain('Paying for: Remaining booking balance');
  expect(initial.body.payment.amount_cents).toBe(15000);
  expect((await f.client.agent.get('/api/bookings/' + booking.id)).body.booking.paid_cents).toBe(0);
  expect(
    (
      await f
        .mutation(f.admin.patch('/api/payments/' + initial.body.payment.id))
        .send({ status: 'received', amountCents: 2000, receiptReference: 'checkout-test-receipt' })
    ).status,
  ).toBe(200);
  const deposit = await checkout('deposit');
  expect(deposit.body.payment.amount_cents).toBe(1000);
  expect(deposit.body.details).toContain('Amount: 10.00 USD');
  const balance = await checkout('balance');
  expect(balance.body.payment.amount_cents).toBe(13000);
  expect(balance.body.details).toContain('Amount: 130.00 USD');
});
it('preserves retry identity and rejects invalid selections or access to another client’s booking', async () => {
  const key = randomUUID();
  const one = await checkout('balance', 'Bank Transfer', key),
    two = await checkout('balance', 'Bank Transfer', key);
  expect(one.body.payment.id).toBe(two.body.payment.id);
  expect(one.body.mailto).toBe(two.body.mailto);
  expect((await checkout('deposit', 'Bank Transfer', key)).status).toBe(409);
  const data = {
    bookingId: booking.id,
    purpose: 'balance',
    method: 'PayPal',
    idempotencyKey: randomUUID(),
  };
  expect((await f.mutation(f.outsider.agent.post('/api/checkout')).send(data)).status).toBe(404);
  expect(
    (
      await f
        .mutation(f.client.agent.post('/api/checkout'))
        .send({ ...data, method: 'Unknown method' })
    ).status,
  ).toBe(400);
  expect(
    (await f.mutation(f.client.agent.post('/api/checkout')).send({ ...data, purpose: 'unknown' }))
      .status,
  ).toBe(400);
});
it('provides an honest quote request when the amount has not yet been agreed', async () => {
  const other = await f
    .mutation(f.client.agent.post('/api/bookings'))
    .send({ ...f.bookingInput, idempotencyKey: randomUUID() });
  expect(other.status).toBe(201);
  expect(
    (
      await f
        .mutation(f.artist.agent.patch('/api/bookings/' + other.body.booking.id))
        .send({ quoteCents: null })
    ).status,
  ).toBe(200);
  const result = await f.mutation(f.client.agent.post('/api/checkout')).send({
    bookingId: other.body.booking.id,
    purpose: 'balance',
    method: 'Western Union',
    idempotencyKey: randomUUID(),
  });
  expect(result.status).toBe(201);
  expect(result.body.payment.amount_cents).toBeNull();
  expect(result.body.details).toContain('Amount: Please provide a quote');
  const deposit = await f.mutation(f.client.agent.post('/api/checkout')).send({
    bookingId: other.body.booking.id,
    purpose: 'deposit',
    method: 'Bank Transfer',
    idempotencyKey: randomUUID(),
  });
  expect(deposit.status).toBe(201);
  expect(deposit.body.payment.amount_cents).toBe(3000);
  expect(deposit.body.details).toContain('Amount: 30.00 USD');
});
it('updates existing settings through the forward migration', async () => {
  const db = await f.pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(
      "UPDATE venue_app.settings SET payment_email='previous@venue.test' WHERE id='site'",
    );
    await db.query(
      readFileSync(
        new URL('../server/migrations/0002_checkout_details.sql', import.meta.url),
        'utf8',
      ),
    );
    expect(
      (await db.query("SELECT payment_email FROM venue_app.settings WHERE id='site'")).rows[0]
        .payment_email,
    ).toBe('carlytatts@gmail.com');
  } finally {
    await db.query('ROLLBACK');
    db.release();
  }
});
