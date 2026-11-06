import { beforeAll, afterAll, expect, it } from 'vitest';
import supertest from 'supertest';
import { fixture } from './helpers/platform.mjs';
import { createApp } from '../server/app.mjs';
let f;
const origin = 'http://127.0.0.1:5173';
beforeAll(async () => {
  f = await fixture();
});
afterAll(async () => {
  await f?.cleanup();
});
const browser = (request) => f.mutation(request).set('X-Venue-Session', 'browser');

it('authenticates a static-site browser without accepting an API cookie and revokes its credential on logout', async () => {
  const account = await f.account('client');
  const response = await browser(supertest(f.app).post('/api/auth/login')).send({
    email: account.email,
    password: account.password,
  });
  expect(response.status).toBe(200);
  expect(response.headers['access-control-expose-headers']).toContain('X-Venue-Session');
  const token = response.headers['x-venue-session'];
  expect(token).toBeTruthy();
  expect(
    (
      await supertest(f.app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ' + token)
    ).body.user.id,
  ).toBe(account.user.id);
  expect((await supertest(f.app).get('/api/auth/me')).status).toBe(401);
  expect(
    (
      await browser(supertest(f.app).post('/api/auth/logout'))
        .set('Authorization', 'Bearer ' + token)
        .send({})
    ).status,
  ).toBe(200);
  expect(
    (
      await supertest(f.app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ' + token)
    ).status,
  ).toBe(401);
  expect((await account.agent.get('/api/auth/me')).status).toBe(200);
});
it('does not expose a browser credential unless explicitly requested by an allowed origin', async () => {
  const account = await f.account('client');
  const normal = await f
    .mutation(supertest(f.app).post('/api/auth/login'))
    .send({ email: account.email, password: account.password });
  expect(normal.status).toBe(200);
  expect(normal.headers['x-venue-session']).toBeUndefined();
  const foreign = await supertest(f.app)
    .post('/api/auth/login')
    .set('Origin', 'https://untrusted.example')
    .set('X-Requested-With', 'VenueWorkspace')
    .set('X-Venue-Session', 'browser')
    .send({ email: account.email, password: account.password });
  expect(foreign.status).toBe(403);
  expect(foreign.headers['x-venue-session']).toBeUndefined();
});
it('exchanges a verified cross-origin organization identity once without relying on API cookies', async () => {
  const account = await f.account('client');
  const apiUrl = 'http://localhost:3001';
  const app = createApp({
    pool: f.pool,
    secret: process.env.JWT_SECRET,
    origins: [origin],
    siteUrl: origin,
    apiUrl,
    oidcProvider: {
      async start(flow) {
        return 'https://identity.example/authorize?state=' + flow.state;
      },
      async finish(url) {
        expect(url.origin).toBe(apiUrl);
        return {
          iss: 'https://identity.example',
          sub: account.user.id,
          email: account.email,
          email_verified: true,
        };
      },
    },
  });
  const agent = supertest.agent(app);
  const start = await agent.get('/api/auth/sso/start');
  const state = new URL(start.headers.location).searchParams.get('state');
  const callback = await agent.get('/api/auth/sso/callback').query({ state, code: 'example' });
  const location = new URL(callback.headers.location);
  expect(location.origin).toBe(origin);
  expect(location.searchParams.get('sso')).toBe('complete');
  const exchange = new URLSearchParams(location.hash.slice(1)).get('exchange');
  expect((await supertest(app).get('/api/auth/me')).status).toBe(401);
  expect(
    (
      await browser(supertest(app).post('/api/auth/sso/complete')).send({
        challenge: exchange,
        code: '123456',
      })
    ).status,
  ).toBe(401);
  const result = await browser(supertest(app).post('/api/auth/sso/exchange')).send({ exchange });
  expect(result.status).toBe(200);
  expect(
    (
      await supertest(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ' + result.headers['x-venue-session'])
    ).body.user.id,
  ).toBe(account.user.id);
  expect(
    (await browser(supertest(app).post('/api/auth/sso/exchange')).send({ exchange })).status,
  ).toBe(401);
});
