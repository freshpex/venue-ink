import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { fixture } from './helpers/platform.mjs';

let f, artist, other, service;
const photo = readFileSync('public/images/tools-workstation-640.webp');
const image = {
  filename: 'Artist portrait.webp',
  mimeType: 'image/webp',
  data: photo.toString('base64'),
};
const serviceInput = {
  name: 'Botanical custom tattoo',
  description: 'Artist-specific design appointment.',
  category: 'Tattoo',
  durationMinutes: 60,
  priceCents: 18000,
  depositCents: 3000,
  active: true,
};
beforeAll(async () => {
  f = await fixture();
  async function create(name) {
    const email = 'artist-workspace-' + randomUUID() + '@venue.test';
    const result = await f
      .mutation(f.admin.post('/api/admin/users'))
      .send({ name, email, password: f.artist.password, role: 'artist', studioId: f.studio.id });
    expect(result.status).toBe(201);
    f.users.push(result.body.user.id);
    const agent = supertest.agent(f.app);
    expect(
      (await f.mutation(agent.post('/api/auth/login')).send({ email, password: f.artist.password }))
        .status,
    ).toBe(200);
    return { ...result.body.user, agent };
  }
  artist = await create('Maya Chen');
  other = await create('Alex Rivera');
}, 60000);
afterAll(async () => {
  await f?.cleanup();
});

it('lets a studio member create and edit personal services without managing studio-wide services', async () => {
  const profile = (await artist.agent.get('/api/profile')).body;
  expect(profile.studios).toEqual([]);
  expect(profile.serviceStudios.map((s) => s.id)).toContain(f.studio.id);
  expect(profile.serviceArtists.map((a) => a.id)).toEqual([artist.id]);
  const created = await f
    .mutation(artist.agent.post('/api/workspace/services'))
    .send({ ...serviceInput, studioId: f.studio.id });
  expect(created.status).toBe(201);
  service = created.body.service;
  expect(
    (await artist.agent.get('/api/workspace/services')).body.services.find(
      (s) => s.id === service.id,
    ).artist_id,
  ).toBe(artist.id);
  expect(
    (
      await f
        .mutation(other.agent.put('/api/workspace/services/' + service.id))
        .send({ ...serviceInput, studioId: f.studio.id })
    ).status,
  ).toBe(404);
  expect(
    (
      await f
        .mutation(artist.agent.put('/api/workspace/services/' + f.service.id))
        .send({ ...serviceInput, studioId: f.studio.id })
    ).status,
  ).toBe(404);
  expect(
    (
      await f
        .mutation(artist.agent.put('/api/workspace/services/' + service.id))
        .send({ ...serviceInput, studioId: f.studio.id, artistId: other.id })
    ).status,
  ).toBe(403);
  expect(
    (
      await f
        .mutation(artist.agent.put('/api/workspace/services/' + service.id))
        .send({ ...serviceInput, studioId: f.studio.id, name: 'Maya botanical session' })
    ).status,
  ).toBe(200);
});
it('lets an administrator edit artist details and hours and exposes only the correct services to clients', async () => {
  for (const person of [artist, other]) {
    const edited = await f.mutation(f.admin.patch('/api/admin/artists/' + person.id)).send({
      displayName: person.name,
      published: true,
      booksOpen: true,
      bio: 'Original botanical artwork.',
      styles: ['Botanical'],
      theme: 'ink',
      studioId: f.studio.id,
    });
    expect(edited.status).toBe(200);
    const hours = await f
      .mutation(f.admin.put('/api/admin/artists/' + person.id + '/availability'))
      .send({
        hours: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          startTime: '10:00',
          endTime: '18:00',
        })),
      });
    expect(hours.status).toBe(200);
  }
  const setup = (await f.admin.get('/api/admin/artists/' + artist.id + '/setup')).body;
  expect(setup.profile.bio).toBe('Original botanical artwork.');
  expect(setup.availability).toHaveLength(7);
  const offered = (await supertest(f.app).get('/api/services').query({ artistId: artist.id })).body
    .services;
  const others = (await supertest(f.app).get('/api/services').query({ artistId: other.id })).body
    .services;
  expect(offered.map((s) => s.id)).toContain(service.id);
  expect(others.map((s) => s.id)).not.toContain(service.id);
  expect(
    (
      await f
        .mutation(f.client.agent.put('/api/admin/artists/' + artist.id + '/availability'))
        .send({ hours: [] })
    ).status,
  ).toBe(403);
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  expect(
    (
      await supertest(f.app)
        .get('/api/availability')
        .query({ artistId: other.id, serviceId: service.id, date: day })
    ).status,
  ).toBe(400);
  const slots = (
    await supertest(f.app)
      .get('/api/availability')
      .query({ artistId: artist.id, serviceId: service.id, date: day })
  ).body.slots;
  expect(slots.length).toBeGreaterThan(0);
  const booked = await f.mutation(f.client.agent.post('/api/bookings')).send({
    ...f.bookingInput,
    artistId: artist.id,
    serviceId: service.id,
    startsAt: slots[0].startsAt,
    idempotencyKey: randomUUID(),
  });
  expect(booked.status).toBe(201);
  await expect(
    f.pool.query('UPDATE venue_app.bookings SET artist_id=$1 WHERE id=$2', [
      other.id,
      booked.body.booking.id,
    ]),
  ).rejects.toMatchObject({ code: '23514' });
  expect(
    (await artist.agent.get('/api/workspace/clients')).body.clients.map((c) => c.id),
  ).toContain(f.client.user.id);
  expect((await other.agent.get('/api/workspace/clients')).body.clients).toEqual([]);
  expect((await f.client.agent.get('/api/workspace/clients')).status).toBe(403);
  expect((await f.mutation(f.admin.delete('/api/admin/artists/' + artist.id))).status).toBe(409);
  expect(
    (
      await f
        .mutation(f.client.agent.patch('/api/bookings/' + booked.body.booking.id))
        .send({ status: 'cancelled', note: 'Client changed their plans.' })
    ).status,
  ).toBe(200);
  const removed = await f.mutation(f.admin.delete('/api/admin/artists/' + artist.id));
  expect(removed.status).toBe(200);
  expect((await artist.agent.get('/api/auth/me')).status).toBe(401);
  expect(
    (await f.admin.get('/api/admin/artists')).body.artists.some((a) => a.id === artist.id),
  ).toBe(false);
  expect(
    (await f.client.agent.get('/api/bookings/' + booked.body.booking.id)).body.booking.artist_name,
  ).toBe('Maya Chen');
  expect(
    (await f.pool.query('SELECT active FROM venue_app.services WHERE id=$1', [service.id])).rows[0]
      .active,
  ).toBe(false);
  expect(
    (await f.mutation(f.admin.patch('/api/admin/users/' + artist.id)).send({ active: true }))
      .status,
  ).toBe(200);
  const restored = (await f.admin.get('/api/admin/artists')).body.artists.find(
    (a) => a.id === artist.id,
  );
  expect(restored).toMatchObject({ published: false, books_open: false, active: true });
  expect((await artist.agent.get('/api/auth/me')).status).toBe(401);
});
it('publishes administrator-uploaded artist and studio photographs and protects them from unrelated users', async () => {
  expect(
    (await f.mutation(f.client.agent.put('/api/accounts/' + other.id + '/photo')).send(image))
      .status,
  ).toBe(403);
  const uploaded = await f
    .mutation(f.admin.put('/api/accounts/' + other.id + '/photo'))
    .send(image);
  expect(uploaded.status).toBe(200);
  const url = uploaded.body.imageUrl;
  expect((await other.agent.get('/api/auth/me')).body.user.image_url).toBe(url);
  expect(
    (await supertest(f.app).get('/api/artists')).body.artists.find((a) => a.id === other.id)
      .image_url,
  ).toBe(url);
  expect((await supertest(f.app).get(url)).status).toBe(200);
  const metadata = (
    await f.pool.query('SELECT bucket FROM venue_app.assets WHERE id=$1', [url.split('/').pop()])
  ).rows[0];
  expect(metadata).toEqual({ bucket: 'profile' });
  const studioPhoto = await f
    .mutation(f.admin.put('/api/studios/' + f.studio.id + '/photo'))
    .send(image);
  expect(studioPhoto.status).toBe(200);
  expect((await supertest(f.app).get('/api/studios/' + f.studio.slug)).body.studio.image_url).toBe(
    studioPhoto.body.imageUrl,
  );
  expect(
    (await f.mutation(f.outsider.agent.put('/api/studios/' + f.studio.id + '/photo')).send(image))
      .status,
  ).toBe(404);
  expect((await f.mutation(other.agent.delete('/api/assets/' + url.split('/').pop()))).status).toBe(
    409,
  );
  expect((await f.mutation(f.admin.delete('/api/accounts/' + other.id + '/photo'))).status).toBe(
    200,
  );
  expect((await supertest(f.app).get(url)).status).toBe(404);
});
it('stores profile photographs directly in the Neon database profile bucket and removes unused images', async () => {
  const result = await f.mutation(f.admin.put('/api/accounts/' + other.id + '/photo')).send(image);
  expect(result.status).toBe(200);
  const assetId = result.body.imageUrl.split('/').pop();
  const stored = (
    await f.pool.query('SELECT bucket,data,public FROM venue_app.assets WHERE id=$1', [assetId])
  ).rows[0];
  expect(stored.bucket).toBe('profile');
  expect(stored.data).toEqual(photo);
  expect(stored.public).toBe(true);
  expect((await f.mutation(f.admin.delete('/api/accounts/' + other.id + '/photo'))).status).toBe(
    200,
  );
  expect((await supertest(f.app).get(result.body.imageUrl)).status).toBe(404);
  expect((await f.mutation(other.agent.delete(result.body.imageUrl))).status).toBe(200);
  expect(
    (await f.pool.query('SELECT id FROM venue_app.assets WHERE id=$1', [assetId])).rowCount,
  ).toBe(0);
});
