import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { fixture } from './helpers/platform.mjs';

let f, menu, other;
beforeAll(async () => {
  f = await fixture();
  const result = await f.mutation(f.admin.post('/api/admin/users')).send({
    name: 'Preset Artist',
    email: 'preset-' + randomUUID() + '@venue.test',
    password: f.client.password,
    role: 'artist',
    studioId: f.studio.id,
  });
  expect(result.status).toBe(201);
  other = result.body.user;
  f.users.push(other.id);
  menu = (await f.admin.get('/api/admin/artists/' + f.artist.user.id + '/service-presets')).body;
}, 60000);
afterAll(async () => {
  await f?.cleanup();
});
const endpoint = () => '/api/admin/artists/' + f.artist.user.id + '/service-presets';

it('offers a complete editable menu only to administrators', async () => {
  expect(menu.presets).toHaveLength(16);
  expect(menu).toMatchObject({
    source: 'starter',
    currency: 'USD',
    artist: { id: f.artist.user.id, studio_id: f.studio.id },
  });
  expect(menu.presets.some((s) => s.priceCents > 0 && s.depositCents > 0)).toBe(true);
  for (const actor of [f.artist.agent, f.client.agent]) {
    expect((await actor.get(endpoint())).status).toBe(403);
    expect((await f.mutation(actor.post(endpoint())).send({ services: menu.presets })).status).toBe(
      403,
    );
    expect((await f.mutation(actor.put(endpoint())).send({ services: menu.presets })).status).toBe(
      403,
    );
  }
});

it('adds an artist’s complete menu atomically while preserving matching manual services', async () => {
  const { key, ...manual } = menu.presets[0];
  const created = await f.mutation(f.artist.agent.post('/api/workspace/services')).send({
    ...manual,
    artistId: f.artist.user.id,
    studioId: f.studio.id,
    name: manual.name.toUpperCase(),
    priceCents: 7700,
    active: false,
  });
  expect(created.status).toBe(201);
  const result = await f.mutation(f.admin.post(endpoint())).send({ services: menu.presets });
  expect(result.status).toBe(201);
  expect(result.body.created).toHaveLength(15);
  expect(result.body.skipped).toEqual([manual.name]);
  const existing = (
    await f.pool.query('SELECT name,price_cents,active FROM venue_app.services WHERE id=$1', [
      created.body.service.id,
    ])
  ).rows[0];
  expect(existing).toEqual({ name: manual.name.toUpperCase(), price_cents: 7700, active: false });
  const services = (
    await f.pool.query(
      'SELECT artist_id,studio_id,preset_key FROM venue_app.services WHERE preset_key IS NOT NULL AND artist_id=$1',
      [f.artist.user.id],
    )
  ).rows;
  expect(services).toHaveLength(15);
  expect(
    services.every((s) => s.artist_id === f.artist.user.id && s.studio_id === f.studio.id),
  ).toBe(true);
  expect(
    (
      await f.pool.query(
        'SELECT count(*)::int AS count FROM venue_app.services WHERE preset_key=$1 AND artist_id=$2',
        [key, f.artist.user.id],
      )
    ).rows[0].count,
  ).toBe(0);
});

it('does not duplicate or overwrite existing services when retried, renamed or applied concurrently', async () => {
  await f.pool.query(
    "UPDATE venue_app.services SET name='My own fine-line service',price_cents=19500 WHERE artist_id=$1 AND preset_key='small-fine-line'",
    [f.artist.user.id],
  );
  const retry = await f.mutation(f.admin.post(endpoint())).send({ services: menu.presets });
  expect(retry.status).toBe(200);
  expect(retry.body.created).toHaveLength(0);
  expect(retry.body.skipped).toHaveLength(16);
  expect(
    (
      await f.pool.query(
        "SELECT price_cents FROM venue_app.services WHERE artist_id=$1 AND preset_key='small-fine-line'",
        [f.artist.user.id],
      )
    ).rows[0].price_cents,
  ).toBe(19500);
  const results = await Promise.all(
    [1, 2].map(() =>
      f
        .mutation(f.admin.post('/api/admin/artists/' + other.id + '/service-presets'))
        .send({ services: menu.presets }),
    ),
  );
  expect(results.map((r) => r.body.created.length).sort((a, b) => a - b)).toEqual([0, 16]);
  expect(
    (
      await f.pool.query(
        'SELECT count(*)::int AS count FROM venue_app.services WHERE artist_id=$1',
        [other.id],
      )
    ).rows[0].count,
  ).toBe(16);
});

it('keeps unpublished artists’ service menus out of the public pricing directory', async () => {
  const services = (await supertest(f.app).get('/api/services')).body.services;
  expect(services.some((s) => s.artist_id === other.id)).toBe(false);
  expect(services.find((s) => s.artist_id === f.artist.user.id).artist_name).toContain('QA Artist');
});

it('rejects invalid menus in full without adding a partial menu', async () => {
  const before = (await f.pool.query('SELECT count(*)::int AS count FROM venue_app.services'))
    .rows[0].count;
  for (const services of [
    [],
    [menu.presets[0], menu.presets[0]],
    [menu.presets[1], { ...menu.presets[2], depositCents: 99999999 }],
    [{ ...menu.presets[1], durationMinutes: 1 }],
    [{ ...menu.presets[1], studioId: f.studio.id }],
  ]) {
    expect((await f.mutation(f.admin.post(endpoint())).send({ services })).status).toBe(400);
  }
  expect(
    (await f.pool.query('SELECT count(*)::int AS count FROM venue_app.services')).rows[0].count,
  ).toBe(before);
  expect(
    (
      await f
        .mutation(f.admin.post('/api/admin/artists/' + f.client.user.id + '/service-presets'))
        .send({ services: menu.presets })
    ).status,
  ).toBe(404);
});

it('saves reusable studio standards, isolates studios, and keeps existing artist prices', async () => {
  const edited = menu.presets.map((s) =>
    s.key === 'small-fine-line'
      ? { ...s, priceCents: 17500, description: 'Our studio’s small fine-line appointment.' }
      : s,
  );
  expect((await f.mutation(f.admin.put(endpoint())).send({ services: edited })).status).toBe(200);
  const shared = (await f.admin.get('/api/admin/artists/' + other.id + '/service-presets')).body;
  expect(shared.source).toBe('studio');
  expect(shared.presets.find((s) => s.key === 'small-fine-line').priceCents).toBe(17500);
  expect(
    (
      await f.pool.query(
        "SELECT price_cents FROM venue_app.services WHERE artist_id=$1 AND preset_key='small-fine-line'",
        [other.id],
      )
    ).rows[0].price_cents,
  ).toBe(15000);
  const independent = await f.account('artist');
  const separate = (
    await f.admin.get('/api/admin/artists/' + independent.user.id + '/service-presets')
  ).body;
  expect(separate.source).toBe('starter');
  expect(separate.presets.find((s) => s.key === 'small-fine-line').priceCents).toBe(15000);
});

it('books generated services and prepares every payment method through email with the selected service amounts', async () => {
  const service = (
    await f.pool.query(
      "SELECT id FROM venue_app.services WHERE artist_id=$1 AND preset_key='medium-fine-line'",
      [f.artist.user.id],
    )
  ).rows[0];
  const slots = (
    await supertest(f.app)
      .get('/api/availability')
      .query({
        artistId: f.artist.user.id,
        serviceId: service.id,
        date: f.bookingInput.startsAt.slice(0, 10),
      })
  ).body.slots;
  const result = await f.mutation(f.client.agent.post('/api/bookings')).send({
    ...f.bookingInput,
    serviceId: service.id,
    startsAt: slots[0].startsAt,
    idempotencyKey: randomUUID(),
  });
  expect(result.status).toBe(201);
  const methods = (await supertest(f.app).get('/api/site')).body.paymentMethods;
  for (const method of methods) {
    for (const purpose of ['deposit', 'balance']) {
      const checkout = await f
        .mutation(f.client.agent.post('/api/checkout'))
        .send({ bookingId: result.body.booking.id, method, purpose, idempotencyKey: randomUUID() });
      expect(checkout.status).toBe(201);
      const url = new URL(checkout.body.mailto);
      expect(url.protocol).toBe('mailto:');
      expect(url.pathname).toBe('carlytatts@gmail.com');
      const body = url.searchParams.get('body');
      expect(body).toContain('Service: Medium fine-line tattoo');
      expect(body).toContain('Artist: QA Artist');
      expect(body).toContain('Payment method: ' + method);
      expect(checkout.body.payment.amount_cents).toBe(purpose === 'deposit' ? 10000 : 30000);
    }
  }
  expect(
    (await f.client.agent.get('/api/bookings/' + result.body.booking.id)).body.booking.paid_cents,
  ).toBe(0);
});
