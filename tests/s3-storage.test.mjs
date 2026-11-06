import { beforeAll, afterAll, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { createAssetStorage, drainAssetDeletions, persistAsset } from '../server/asset-storage.mjs';
import { verifyProfileStorage } from '../server/profile-storage.mjs';
import { fixture } from './helpers/platform.mjs';
import { s3Fixture } from './helpers/s3.mjs';

let s3, storage, f;
const bytes = readFileSync('public/images/tools-workstation-640.webp');
const image = {
  filename: 'Reference.webp',
  mimeType: 'image/webp',
  data: bytes.toString('base64'),
};
beforeAll(async () => {
  s3 = await s3Fixture();
  storage = createAssetStorage(s3.env);
  f = await fixture({ profileStorage: storage });
}, 60000);
afterAll(async () => {
  await f?.cleanup();
  await s3?.close();
});

it('requires complete server-side S3 configuration and rejects insecure production endpoints', () => {
  expect(createAssetStorage({}).provider).toBe('database');
  expect(() => createAssetStorage({ AWS_ENDPOINT_URL_S3: 'https://storage.example.test' })).toThrow(
    'AWS_ACCESS_KEY_ID',
  );
  expect(() => createAssetStorage({ ...s3.env, NODE_ENV: 'production' })).toThrow('HTTPS');
});

it('stores booking references in S3, keeps them private, and grants access only to the booking participants', async () => {
  const uploaded = await f.mutation(f.client.agent.post('/api/assets')).send(image);
  expect(uploaded.status).toBe(201);
  const { id, url } = uploaded.body.asset;
  const saved = (
    await f.pool.query(
      'SELECT storage_provider,storage_key,bucket,data FROM venue_app.assets WHERE id=$1',
      [id],
    )
  ).rows[0];
  expect(saved).toMatchObject({ storage_provider: 's3', bucket: 'profile', data: null });
  expect(s3.objects.get('/profile/' + saved.storage_key)).toEqual(bytes);
  expect((await supertest(f.app).get(url)).status).toBe(404);
  expect((await f.outsider.agent.get(url)).status).toBe(404);
  const own = await f.client.agent.get(url);
  expect(own.status).toBe(200);
  expect(own.body).toEqual(bytes);
  expect(own.headers['cache-control']).toBe('private,no-store');
  const booking = await f
    .mutation(f.client.agent.post('/api/bookings'))
    .send({ ...f.bookingInput, idempotencyKey: randomUUID(), assetIds: [id] });
  expect(booking.status).toBe(201);
  expect((await f.artist.agent.get(url)).status).toBe(200);
  expect((await f.mutation(f.client.agent.delete(url))).status).toBe(409);
  expect(s3.objects.has('/profile/' + saved.storage_key)).toBe(true);
  expect(JSON.stringify(uploaded.body)).not.toContain('storage_key');
});

it('serves S3 artist and studio photographs publicly and keeps old database images readable', async () => {
  for (const endpoint of [
    '/api/accounts/' + f.artist.user.id + '/photo',
    '/api/studios/' + f.studio.id + '/photo',
  ]) {
    const result = await f.mutation(f.admin.put(endpoint)).send(image);
    expect(result.status).toBe(200);
    const response = await supertest(f.app).get(result.body.imageUrl);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(bytes);
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
  }
  const id = randomUUID();
  await f.pool.query(
    'INSERT INTO venue_app.assets(id,owner_id,mime_type,filename,byte_size,data,public) VALUES($1,$2,$3,$4,$5,$6,true)',
    [id, f.artist.user.id, image.mimeType, image.filename, bytes.length, bytes],
  );
  const legacy = await supertest(f.app).get('/api/assets/' + id);
  expect(legacy.status).toBe(200);
  expect(legacy.body).toEqual(bytes);
  expect(
    s3.requests
      .filter((r) => r.method === 'PUT')
      .every((r) => r.acl === undefined && r.contentType.startsWith('image/')),
  ).toBe(true);
});

it('publishes artwork from S3 without exposing credentials or object URLs', async () => {
  const uploaded = await f.mutation(f.artist.agent.post('/api/assets')).send(image);
  const result = await f.mutation(f.artist.agent.post('/api/workspace/flash')).send({
    artistId: f.artist.user.id,
    title: 'S3 botanical artwork',
    description: '',
    category: 'Botanical',
    assetId: uploaded.body.asset.id,
    priceCents: null,
    sizeNote: '',
    placementNote: '',
    repeatable: true,
    published: true,
    archived: false,
  });
  expect(result.status).toBe(201);
  expect((await supertest(f.app).get(uploaded.body.asset.url)).status).toBe(200);
  expect(
    (await supertest(f.app).get('/api/flash')).body.designs.some(
      (d) => d.asset_id === uploaded.body.asset.id || d.image_url === uploaded.body.asset.url,
    ),
  ).toBe(true);
});

it('does not publish broken profile photos when storage is unavailable', async () => {
  const before = (await f.artist.agent.get('/api/auth/me')).body.user.image_url;
  s3.failures.add('PUT');
  try {
    const result = await f
      .mutation(f.admin.put('/api/accounts/' + f.artist.user.id + '/photo'))
      .send(image);
    expect(result.status).toBe(503);
    expect((await f.artist.agent.get('/api/auth/me')).body.user.image_url).toBe(before);
    expect(JSON.stringify(result.body)).not.toContain(s3.env.AWS_SECRET_ACCESS_KEY);
  } finally {
    s3.failures.clear();
  }
});

it('retries failed object deletions and protects committed files from compensation', async () => {
  const uploaded = await f.mutation(f.client.agent.post('/api/assets')).send(image);
  const asset = (
    await f.pool.query('SELECT * FROM venue_app.assets WHERE id=$1', [uploaded.body.asset.id])
  ).rows[0];
  s3.failures.add('DELETE');
  try {
    expect((await f.mutation(f.client.agent.delete(uploaded.body.asset.url))).status).toBe(200);
  } finally {
    s3.failures.clear();
  }
  expect((await f.client.agent.get(uploaded.body.asset.url)).status).toBe(404);
  const job = (
    await f.pool.query('SELECT * FROM venue_app.asset_object_deletions WHERE storage_key=$1', [
      asset.storage_key,
    ])
  ).rows[0];
  expect(job.attempts).toBeGreaterThan(0);
  await f.pool.query(
    'UPDATE venue_app.asset_object_deletions SET next_attempt_at=now() WHERE id=$1',
    [job.id],
  );
  await drainAssetDeletions(f.pool, storage);
  expect(s3.objects.has('/profile/' + asset.storage_key)).toBe(false);
  const retained = (
    await f.pool.query(
      "SELECT storage_key FROM venue_app.assets WHERE storage_provider='s3' LIMIT 1",
    )
  ).rows[0];
  await f.pool.query(
    'INSERT INTO venue_app.asset_object_deletions(bucket,storage_key) VALUES($1,$2)',
    ['profile', retained.storage_key],
  );
  await drainAssetDeletions(f.pool, storage);
  expect(s3.objects.has('/profile/' + retained.storage_key)).toBe(true);
});

it('cleans up uploaded objects when database finalization rolls back', async () => {
  const id = randomUUID();
  await expect(
    persistAsset(
      f.pool,
      storage,
      { id, ownerId: f.client.user.id, bytes, mimeType: image.mimeType, filename: image.filename },
      async () => {
        throw new Error('Rejected profile change');
      },
    ),
  ).rejects.toThrow('Rejected profile change');
  expect((await f.pool.query('SELECT 1 FROM venue_app.assets WHERE id=$1', [id])).rowCount).toBe(0);
  await f.pool.query(
    'UPDATE venue_app.asset_object_deletions SET next_attempt_at=now() WHERE storage_key=$1',
    [`images/${f.client.user.id}/${id}`],
  );
  await drainAssetDeletions(f.pool, storage);
  expect(s3.objects.has(`/profile/images/${f.client.user.id}/${id}`)).toBe(false);
});

it('verifies the live storage lifecycle using disposable objects and rolls back probe database records', async () => {
  const before = s3.objects.size;
  expect(await verifyProfileStorage(storage, f.pool)).toEqual({
    provider: 's3',
    bucket: 'profile',
    writeReadDeleteVerified: true,
  });
  expect(s3.objects.size).toBe(before);
  expect(
    (
      await f.pool.query(
        "SELECT 1 FROM venue_app.users WHERE email LIKE 'storage-check-%@venue.invalid'",
      )
    ).rowCount,
  ).toBe(0);
});
