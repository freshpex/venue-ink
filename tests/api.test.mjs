import { beforeAll, afterAll, it, expect } from 'vitest';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { fixture } from './helpers/platform.mjs';
let f, booking, payment, asset;
beforeAll(async () => {
  f = await fixture();
}, 60000);
afterAll(async () => {
  await f?.cleanup();
}, 60000);
it('connects to the configured database and verifies the seeded admin password', async () => {
  expect((await supertest(f.app).get('/api/health')).body.ready).toBe(true);
  const admin = (
    await f.pool.query('SELECT role,password_hash FROM venue_app.users WHERE email=$1', [
      'admin@venue.com',
    ])
  ).rows[0];
  expect(admin.role).toBe('admin');
  expect(await bcrypt.compare(process.env.SEED_ADMIN_PASSWORD, admin.password_hash)).toBe(true);
});
it('rejects unauthorized records, origins and role escalation', async () => {
  expect((await supertest(f.app).get('/api/bookings')).status).toBe(401);
  expect((await supertest(f.app).post('/api/auth/register').send({})).status).toBe(403);
  expect(
    (
      await f
        .mutation(f.client.agent.post('/api/auth/register'))
        .send({
          name: 'Escalation',
          email: 'escalation@venue.test',
          password: 'LongPassword42!',
          role: 'admin',
        })
    ).status,
  ).toBe(400);
  expect((await f.client.agent.get('/api/admin/users')).status).toBe(403);
});
it('serves every authenticated workspace collection', async () => {
  for (const path of [
    '/dashboard',
    '/profile',
    '/bookings',
    '/payments',
    '/notifications',
    '/support',
    '/ideas',
    '/assets',
  ])
    expect((await f.client.agent.get('/api' + path)).status, path).toBe(200);
  for (const path of ['/workspace/services', '/workspace/flash', '/workspace/events', '/team'])
    expect((await f.artist.agent.get('/api' + path)).status, path).toBe(200);
  for (const path of ['/overview', '/users', '/support', '/articles', '/settings', '/audit'])
    expect((await f.admin.get('/api/admin' + path)).status, path).toBe(200);
});
it('validates real calendar dates', async () => {
  expect(
    (
      await supertest(f.app)
        .get('/api/availability')
        .query({ artistId: f.artist.user.id, serviceId: f.service.id, date: '2027-02-31' })
    ).status,
  ).toBe(400);
});
it('stores reference images privately and checks ownership', async () => {
  const result = await f
    .mutation(f.client.agent.post('/api/assets'))
    .send({
      filename: 'reference.png',
      mimeType: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII=',
    });
  expect(result.status).toBe(201);
  asset = result.body.asset;
  expect((await supertest(f.app).get('/api/assets/' + asset.id)).status).toBe(404);
  expect((await f.outsider.agent.get('/api/assets/' + asset.id)).status).toBe(404);
  expect((await f.client.agent.get('/api/assets/' + asset.id)).status).toBe(200);
  expect(
    (
      await f
        .mutation(f.outsider.agent.post('/api/bookings'))
        .send({ ...f.bookingInput, idempotencyKey: randomUUID(), assetIds: [asset.id] })
    ).status,
  ).toBe(403);
});
it('creates one real booking during concurrent retries and retains its date', async () => {
  const payload = { ...f.bookingInput, assetIds: [asset.id] };
  const results = await Promise.all([
    f.mutation(f.client.agent.post('/api/bookings')).send(payload),
    f.mutation(f.client.agent.post('/api/bookings')).send(payload),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
  expect(results[0].body.booking.id).toBe(results[1].body.booking.id);
  expect(results[0].body.booking.starts_at).toBeTruthy();
  booking = results[0].body.booking;
  expect(
    (
      await f
        .mutation(f.client.agent.post('/api/bookings'))
        .send({ ...payload, title: 'Changed artwork' })
    ).status,
  ).toBe(409);
});
it('protects booking details and conversation from another client', async () => {
  expect((await f.outsider.agent.get('/api/bookings/' + booking.id)).status).toBe(404);
  expect((await f.outsider.agent.get('/api/bookings/' + booking.id + '/messages')).status).toBe(
    404,
  );
  expect(
    (
      await f
        .mutation(f.outsider.agent.post('/api/bookings/' + booking.id + '/messages'))
        .send({ body: 'Access attempt' })
    ).status,
  ).toBe(404);
  expect((await f.artist.agent.get('/api/assets/' + asset.id)).status).toBe(200);
});
it('persists the booking conversation', async () => {
  expect(
    (
      await f
        .mutation(f.client.agent.post('/api/bookings/' + booking.id + '/messages'))
        .send({ body: 'Can we discuss the placement?' })
    ).status,
  ).toBe(201);
  expect(
    (await f.artist.agent.get('/api/bookings/' + booking.id + '/messages')).body.messages[0].body,
  ).toContain('placement');
});
it('requires artist review and serializes conflicting confirmations', async () => {
  expect(
    (
      await f
        .mutation(f.client.agent.patch('/api/bookings/' + booking.id))
        .send({ status: 'confirmed' })
    ).status,
  ).toBe(403);
  const other = await f
    .mutation(f.outsider.agent.post('/api/bookings'))
    .send({ ...f.bookingInput, idempotencyKey: randomUUID() });
  expect(other.status).toBe(201);
  const results = await Promise.all([
    f.mutation(f.artist.agent.patch('/api/bookings/' + booking.id)).send({ status: 'confirmed' }),
    f
      .mutation(f.artist.agent.patch('/api/bookings/' + other.body.booking.id))
      .send({ status: 'confirmed' }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const winning = results[0].status === 200 ? booking.id : other.body.booking.id;
  expect(
    (
      await supertest(f.app)
        .get('/api/availability')
        .query({
          artistId: f.artist.user.id,
          serviceId: f.service.id,
          date: f.bookingInput.startsAt.slice(0, 10),
        })
    ).body.slots.some((s) => s.startsAt === f.bookingInput.startsAt),
  ).toBe(false);
  if (winning !== booking.id) {
    await f
      .mutation(f.artist.agent.patch('/api/bookings/' + winning))
      .send({ status: 'cancelled' });
    expect(
      (
        await f
          .mutation(f.artist.agent.patch('/api/bookings/' + booking.id))
          .send({ status: 'confirmed' })
      ).status,
    ).toBe(200);
  }
});
it('saves each requested payment method and produces the exact email recipient and details', async () => {
  const methods = (await supertest(f.app).get('/api/site')).body.paymentMethods;
  expect(methods).toHaveLength(8);
  for (const method of methods) {
    const result = await f
      .mutation(f.client.agent.post('/api/checkout'))
      .send({ bookingId: booking.id, method, purpose: 'balance', idempotencyKey: randomUUID() });
    expect(result.status, result.body.message).toBe(201);
    expect(result.body.mailto).toMatch(/^mailto:payment@venue.com\?/);
    expect(result.body.details).toContain(method);
    expect(result.body.details).toContain('Botanical linework');
    expect(result.body.payment.status).toBe('requested');
    expect(result.body.payment.amount_cents).toBe(15000);
    payment = result.body.payment;
  }
  expect((await f.client.agent.get('/api/bookings/' + booking.id)).body.booking.paid_cents).toBe(0);
});
it('does not let the client mark a payment received or inject an amount', async () => {
  expect(
    (
      await f
        .mutation(f.client.agent.patch('/api/payments/' + payment.id))
        .send({ status: 'received', receiptReference: 'Attempt', amountCents: 15000 })
    ).status,
  ).toBe(404);
  expect(
    (
      await f
        .mutation(f.client.agent.post('/api/checkout'))
        .send({
          bookingId: booking.id,
          method: 'PayPal',
          amountCents: 1,
          idempotencyKey: randomUUID(),
        })
    ).status,
  ).toBe(400);
});
it('records verified receipt once and prevents overpayment', async () => {
  expect(
    (
      await f
        .mutation(f.artist.agent.patch('/api/payments/' + payment.id))
        .send({ status: 'received', receiptReference: 'QA-RECEIPT', amountCents: 15001 })
    ).status,
  ).toBe(400);
  expect(
    (
      await f
        .mutation(f.artist.agent.patch('/api/payments/' + payment.id))
        .send({ status: 'received', receiptReference: 'QA-RECEIPT', amountCents: 15000 })
    ).status,
  ).toBe(200);
  expect(
    (
      await f
        .mutation(f.artist.agent.patch('/api/payments/' + payment.id))
        .send({ status: 'received', receiptReference: 'QA-RECEIPT', amountCents: 15000 })
    ).status,
  ).toBe(409);
  expect((await f.client.agent.get('/api/bookings/' + booking.id)).body.booking.paid_cents).toBe(
    15000,
  );
  expect(
    (
      await f
        .mutation(f.client.agent.post('/api/checkout'))
        .send({ bookingId: booking.id, method: 'PayPal', idempotencyKey: randomUUID() })
    ).status,
  ).toBe(409);
});
it('stores support requests and returns administrator replies', async () => {
  const result = await f
    .mutation(f.client.agent.post('/api/contact'))
    .send({
      name: 'QA Client',
      email: f.client.email,
      category: 'Account support',
      message: 'Please help me with my account settings.',
    });
  expect(result.status).toBe(201);
  f.supportRefs.push(result.body.request.reference);
  expect(
    (
      await f
        .mutation(f.admin.patch('/api/admin/support/' + result.body.request.id))
        .send({ status: 'resolved', reply: 'Your account settings are available in My account.' })
    ).status,
  ).toBe(200);
  expect((await f.client.agent.get('/api/support')).body.requests[0].reply).toContain('My account');
});
it('publishes owned artwork and persists saved designs', async () => {
  const uploaded = await f
    .mutation(f.artist.agent.post('/api/assets'))
    .send({
      filename: 'artwork.png',
      mimeType: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII=',
    });
  expect(uploaded.status).toBe(201);
  const payload = {
    artistId: f.artist.user.id,
    title: 'Original botanical study',
    description: 'Original work for verification',
    category: 'Botanical',
    assetId: uploaded.body.asset.id,
    priceCents: null,
    sizeNote: '10 cm',
    placementNote: 'Forearm',
    repeatable: false,
    published: true,
    archived: false,
  };
  const result = await f.mutation(f.artist.agent.post('/api/workspace/flash')).send(payload);
  expect(result.status).toBe(201);
  const design = result.body.design;
  expect(
    (await supertest(f.app).get('/api/flash')).body.designs.some((d) => d.id === design.id),
  ).toBe(true);
  expect(
    (await f.mutation(f.client.agent.put('/api/saved-designs/' + design.id)).send({ saved: true }))
      .status,
  ).toBe(200);
  expect((await f.client.agent.get('/api/saved-designs')).body.ids).toContain(design.id);
  expect(
    (await f.mutation(f.outsider.agent.put('/api/workspace/flash/' + design.id)).send(payload))
      .status,
  ).toBe(403);
  expect(
    (
      await f
        .mutation(f.artist.agent.put('/api/workspace/flash/' + design.id))
        .send({ ...payload, published: false })
    ).status,
  ).toBe(200);
  expect(
    (await supertest(f.app).get('/api/flash')).body.designs.some((d) => d.id === design.id),
  ).toBe(false);
});
it('publishes events and constrains availability to the event window', async () => {
  const event = await f
    .mutation(f.artist.agent.post('/api/workspace/events'))
    .send({
      studioId: f.studio.id,
      artistId: f.artist.user.id,
      serviceId: f.service.id,
      title: 'Studio gathering',
      description: 'A day for original work',
      location: 'Studio',
      startsAt: f.slots[4].startsAt,
      endsAt: f.slots[7].endsAt,
      capacity: 1,
      published: true,
    });
  expect(event.status).toBe(201);
  expect(
    (await supertest(f.app).get('/api/events')).body.events.some(
      (e) => e.id === event.body.event.id,
    ),
  ).toBe(true);
  const availability = await supertest(f.app)
    .get('/api/availability')
    .query({
      artistId: f.artist.user.id,
      serviceId: f.service.id,
      date: f.bookingInput.startsAt.slice(0, 10),
      eventId: event.body.event.id,
    });
  expect(availability.status).toBe(200);
  expect(
    availability.body.slots.every(
      (s) => s.startsAt >= f.slots[4].startsAt && s.endsAt <= f.slots[7].endsAt,
    ),
  ).toBe(true);
});
it('creates and accepts email-bound studio invitations', async () => {
  const email = 'invited-' + randomUUID() + '@venue.test';
  const invite = await f
    .mutation(f.artist.agent.post('/api/team/invitations'))
    .send({ studioId: f.studio.id, email });
  expect(invite.status).toBe(201);
  const agent = supertest.agent(f.app);
  const result = await f
    .mutation(agent.post('/api/auth/register'))
    .send({
      name: 'Invited Artist',
      email,
      password: 'IntegrationPassword42!',
      role: 'artist',
      invitation: invite.body.token,
    });
  expect(result.status).toBe(201);
  f.users.push(result.body.user.id);
  expect((await agent.get('/api/profile')).body.profile.studio_id).toBe(f.studio.id);
  expect(
    (
      await f
        .mutation(agent.post('/api/auth/register'))
        .send({
          name: 'Another artist',
          email: 'another-' + email,
          password: 'IntegrationPassword42!',
          role: 'artist',
          invitation: invite.body.token,
        })
    ).status,
  ).toBe(400);
});
it('provisions an artist profile when an administrator promotes a client', async () => {
  const account = await f.account('client');
  const result = await f
    .mutation(f.admin.patch('/api/admin/users/' + account.user.id))
    .send({ role: 'artist' });
  expect(result.status).toBe(200);
  expect((await account.agent.get('/api/auth/me')).status).toBe(401);
  await f
    .mutation(account.agent.post('/api/auth/login'))
    .send({ email: account.email, password: account.password });
  expect((await account.agent.get('/api/profile')).body.profile).toBeTruthy();
});
it('protects the administrator from self-demotion', async () => {
  const admin = (await f.admin.get('/api/auth/me')).body.user;
  expect(
    (await f.mutation(f.admin.patch('/api/admin/users/' + admin.id)).send({ role: 'client' }))
      .status,
  ).toBe(400);
});
it('revokes the session after logout', async () => {
  expect((await f.mutation(f.outsider.agent.post('/api/auth/logout')).send({})).status).toBe(200);
  expect((await f.outsider.agent.get('/api/auth/me')).status).toBe(401);
});
