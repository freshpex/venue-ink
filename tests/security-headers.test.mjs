import { it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import supertest from 'supertest';
import { createApp } from '../server/app.mjs';

it.each([false, true])(
  'keeps CSP enabled and upgrades HTTP resources only in production (production=%s)',
  async (production) => {
    const app = createApp({
      pool: {},
      secret: randomBytes(32).toString('hex'),
      origins: [production ? 'https://venue.example' : 'http://127.0.0.1:4173'],
      production,
      securityHeaders: true,
      logger: () => {},
    });
    const response = await supertest(app).get('/api/health/live');
    expect(response.status).toBe(200);
    const policy = response.headers['content-security-policy'];
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy.includes('upgrade-insecure-requests')).toBe(production);
  },
);
