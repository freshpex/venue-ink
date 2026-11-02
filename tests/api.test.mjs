import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import supertest from 'supertest';
import { createApp, migration } from '../server/app.mjs';
const memory = newDb();
const { Pool } = memory.adapters.createPg();
const pool = new Pool();
const origin = 'http://localhost:5173';
const app = createApp({
  pool,
  secret: 'test-secret-with-more-than-thirty-two-characters',
  origins: [origin],
  limit: 100,
});
const agent = supertest.agent(app);
const mutation = (req) => req.set('Origin', origin).set('X-Requested-With', 'VenueWorkspace');
beforeAll(async () => {
  await pool.query(migration);
});
afterAll(async () => {
  await pool.end();
});
describe('workspace API', () => {
  it('reports database readiness', async () => {
    const r = await agent.get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.ready).toBe(true);
  });
  it('protects private records', async () => {
    expect((await supertest(app).get('/api/ideas')).status).toBe(401);
  });
  it('rejects untrusted mutation origins', async () => {
    const r = await agent.post('/api/auth/register').send({});
    expect(r.status).toBe(403);
  });
  it('validates registrations server-side', async () => {
    const r = await mutation(agent.post('/api/auth/register')).send({
      email: 'bad',
      password: 'short',
      name: 'A',
    });
    expect(r.status).toBe(400);
  });
  it('registers and uses an HttpOnly session without exposing a hash', async () => {
    const r = await mutation(agent.post('/api/auth/register')).send({
      email: 'artist@example.com',
      password: 'a-very-long-password',
      name: 'Example Artist',
    });
    expect(r.status).toBe(201);
    expect(r.body.user.password_hash).toBeUndefined();
    expect(r.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('artist@example.com');
  });
  it('rejects duplicate accounts', async () => {
    const r = await mutation(agent.post('/api/auth/register')).send({
      email: 'ARTIST@example.com',
      password: 'another-long-password',
      name: 'Another',
    });
    expect(r.status).toBe(409);
  });
  it('validates idea payload and stores owned records', async () => {
    expect((await mutation(agent.post('/api/ideas')).send({ title: '' })).status).toBe(400);
    const r = await mutation(agent.post('/api/ideas')).send({
      title: 'Botanical collection',
    });
    expect(r.status).toBe(201);
    const list = await agent.get('/api/ideas');
    expect(list.body.ideas[0].title).toBe('Botanical collection');
  });
  it('isolates another user from existing ideas', async () => {
    const other = supertest.agent(app);
    await mutation(other.post('/api/auth/register')).send({
      email: 'second@example.com',
      password: 'second-long-password',
      name: 'Second Artist',
    });
    const own = await agent.get('/api/ideas');
    expect((await other.get('/api/ideas')).body.ideas).toEqual([]);
    expect((await mutation(other.delete('/api/ideas/' + own.body.ideas[0].id))).status).toBe(404);
  });
  it('deletes only the owner’s idea', async () => {
    const result = await agent.get('/api/ideas');
    expect((await mutation(agent.delete('/api/ideas/' + result.body.ideas[0].id))).status).toBe(
      200,
    );
    expect((await agent.get('/api/ideas')).body.ideas).toEqual([]);
  });
  it('revokes sessions on logout and rejects wrong passwords', async () => {
    const cookies = (
      await mutation(agent.post('/api/auth/login')).send({
        email: 'artist@example.com',
        password: 'a-very-long-password',
      })
    ).headers['set-cookie'];
    expect((await mutation(agent.post('/api/auth/logout'))).status).toBe(200);
    expect((await supertest(app).get('/api/auth/me').set('Cookie', cookies)).status).toBe(401);
    expect(
      (
        await mutation(agent.post('/api/auth/login')).send({
          email: 'artist@example.com',
          password: 'wrong-long-password',
        })
      ).status,
    ).toBe(401);
  });
});
