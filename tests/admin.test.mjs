import { beforeAll, afterAll, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import supertest from 'supertest';
import { createApp } from '../server/app.mjs';

let pool, app, admin, client, adminId, studio, artist;
const origin = 'http://127.0.0.1:5173';
const password = 'AdminCreationTest42!';
const mutation = (req) => req.set('Origin', origin).set('X-Requested-With', 'VenueWorkspace');
beforeAll(async () => {
  const db = newDb();
  db.public.registerFunction({
    name: 'pg_advisory_xact_lock',
    args: ['integer'],
    returns: 'integer',
    implementation: () => 1,
  });
  db.public.none(
    readFileSync(new URL('../server/migrations/0000_venue_platform.sql', import.meta.url), 'utf8'),
  );
  const pg = db.adapters.createPg();
  pool = new pg.Pool();
  adminId = randomUUID();
  await pool.query(
    'INSERT INTO venue_app.users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)',
    [adminId, 'Platform Owner', 'owner@venue.test', await bcrypt.hash(password, 4), 'admin'],
  );
  await pool.query("INSERT INTO venue_app.settings(id) VALUES('site')");
  app = createApp({
    pool,
    secret: 'isolated-admin-test-secret-more-than-32-chars',
    origins: [origin],
    limit: 1000,
  });
  admin = supertest.agent(app);
  expect(
    (await mutation(admin.post('/api/auth/login')).send({ email: 'owner@venue.test', password }))
      .status,
  ).toBe(200);
  client = supertest.agent(app);
  expect(
    (
      await mutation(client.post('/api/auth/register')).send({
        name: 'A Client',
        email: 'client@venue.test',
        password,
        role: 'client',
      })
    ).status,
  ).toBe(201);
}, 30000);
afterAll(async () => {
  await pool?.end();
});

it('only administrators can create accounts or manage artist publication', async () => {
  expect((await mutation(supertest(app).post('/api/admin/users')).send({})).status).toBe(401);
  expect((await mutation(client.post('/api/admin/users')).send({})).status).toBe(403);
  expect((await client.get('/api/admin/artists')).status).toBe(403);
  expect((await mutation(client.patch('/api/admin/artists/' + randomUUID())).send({})).status).toBe(
    403,
  );
});
it('creates every account role without replacing the administrator session or exposing password hashes', async () => {
  for (const role of ['client', 'studio', 'artist', 'admin']) {
    const response = await mutation(admin.post('/api/admin/users')).send({
      name: role === 'artist' ? 'Maya Chen' : 'New ' + role,
      email: role + '-created@venue.test',
      password,
      role,
      ...(['studio', 'artist'].includes(role)
        ? { studioName: role === 'studio' ? 'Northside Ink' : 'Maya Studio' }
        : {}),
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.user.password_hash).toBeUndefined();
    expect(response.body.user.role).toBe(role);
    if (role === 'studio')
      studio = (
        await pool.query('SELECT * FROM venue_app.studios WHERE owner_id=$1', [
          response.body.user.id,
        ])
      ).rows[0];
    if (role === 'artist') artist = response.body.user;
    const login = supertest.agent(app);
    expect(
      (
        await mutation(login.post('/api/auth/login')).send({
          email: role + '-created@venue.test',
          password,
        })
      ).status,
    ).toBe(200);
    expect((await admin.get('/api/auth/me')).body.user.id).toBe(adminId);
    const profile = (await login.get('/api/profile')).body;
    if (role === 'studio') {
      expect(profile.studios[0].name).toBe('Northside Ink');
      expect(profile.profile).toBeNull();
    }
    if (role === 'artist') {
      expect(profile.profile.display_name).toBe('Maya Chen');
      expect(profile.profile.published).toBe(false);
      expect(profile.profile.books_open).toBe(false);
    }
    if (role === 'admin' || role === 'client') {
      expect(
        (
          await pool.query('SELECT * FROM venue_app.artist_profiles WHERE user_id=$1', [
            response.body.user.id,
          ])
        ).rowCount,
      ).toBe(0);
    }
  }
});
it('attaches an artist to a named existing studio without creating a duplicate studio', async () => {
  const before = (await pool.query('SELECT * FROM venue_app.studios')).rowCount;
  const result = await mutation(admin.post('/api/admin/users')).send({
    name: 'Alex Rivera',
    email: 'alex@venue.test',
    password,
    role: 'artist',
    studioId: studio.id,
  });
  expect(result.status).toBe(201);
  const profile = (
    await pool.query('SELECT * FROM venue_app.artist_profiles WHERE user_id=$1', [
      result.body.user.id,
    ])
  ).rows[0];
  expect(profile.studio_id).toBe(studio.id);
  expect(profile.display_name).toBe('Alex Rivera');
  expect((await pool.query('SELECT * FROM venue_app.studios')).rowCount).toBe(before);
  const directory = await admin.get('/api/admin/artists');
  expect(directory.body.artists.find((a) => a.id === result.body.user.id).studio_name).toBe(
    'Northside Ink',
  );
});
it('validates account roles, passwords, studio assignments and duplicate email', async () => {
  const base = { name: 'New User', email: 'invalid@venue.test', password, role: 'client' };
  for (const change of [
    { role: 'superadmin' },
    { password: 'short' },
    { studioId: studio.id },
    { name: '' },
  ]) {
    expect(
      (await mutation(admin.post('/api/admin/users')).send({ ...base, ...change })).status,
    ).toBe(400);
  }
  expect(
    (
      await mutation(admin.post('/api/admin/users')).send({
        ...base,
        email: 'client-created@venue.test',
      })
    ).status,
  ).toBe(409);
});
it('edits public artist names and blocks restricted profiles from reopening books', async () => {
  const update = { displayName: 'Maya Chen Tattoo', published: true, booksOpen: true };
  expect((await mutation(admin.patch('/api/admin/artists/' + artist.id)).send(update)).status).toBe(
    200,
  );
  const stored = (
    await pool.query('SELECT * FROM venue_app.artist_profiles WHERE user_id=$1', [artist.id])
  ).rows[0];
  expect(stored.display_name).toBe('Maya Chen Tattoo');
  expect(stored.published).toBe(true);
  expect(
    (await mutation(admin.patch('/api/admin/users/' + artist.id)).send({ active: false })).status,
  ).toBe(200);
  expect((await mutation(admin.patch('/api/admin/artists/' + artist.id)).send(update)).status).toBe(
    400,
  );
  expect(
    (await pool.query('SELECT * FROM venue_app.artist_profiles WHERE user_id=$1', [artist.id]))
      .rows[0].published,
  ).toBe(false);
  const logs = (
    await pool.query("SELECT details FROM venue_app.audit_logs WHERE action='account.created'")
  ).rows;
  expect(logs.some((r) => JSON.stringify(r.details).includes(password))).toBe(false);
});
it('provisions a studio when promoting a client and preserves self-access protections', async () => {
  const user = (await client.get('/api/auth/me')).body.user;
  expect(
    (await mutation(admin.patch('/api/admin/users/' + user.id)).send({ role: 'studio' })).status,
  ).toBe(200);
  expect(
    (await pool.query('SELECT * FROM venue_app.studios WHERE owner_id=$1', [user.id])).rowCount,
  ).toBe(1);
  expect(
    (await pool.query('SELECT * FROM venue_app.artist_profiles WHERE user_id=$1', [user.id]))
      .rowCount,
  ).toBe(0);
  expect((await client.get('/api/auth/me')).status).toBe(401);
  expect(
    (await mutation(admin.patch('/api/admin/users/' + adminId)).send({ role: 'client' })).status,
  ).toBe(400);
});

it('keeps administrator access after a name-only edit', async () => {
  expect(
    (
      await mutation(admin.patch('/api/admin/users/' + adminId)).send({
        name: 'Platform Operations',
      })
    ).status,
  ).toBe(200);
  const session = await admin.get('/api/auth/me');
  expect(session.status).toBe(200);
  expect(session.body.user.name).toBe('Platform Operations');
});
