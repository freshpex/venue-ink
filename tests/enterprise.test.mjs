import { beforeAll, afterAll, it, expect } from 'vitest';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers/platform.mjs';
import { createApp } from '../server/app.mjs';
import { unseal, totp } from '../server/security.mjs';
import { runOperations, mailjetTransport } from '../server/mail.mjs';
let f, mfaAccount, recoveryCodes, resetToken;
const origin = 'http://127.0.0.1:5173';
beforeAll(async () => {
  f = await fixture();
}, 60000);
afterAll(async () => {
  await f?.cleanup();
}, 60000);
async function latestToken(userId, purpose) {
  const queue = (
    await f.pool.query(
      "SELECT encrypted_message FROM venue_app.email_outbox WHERE user_id=$1 AND dedupe_key LIKE 'account-token:%' ORDER BY created_at DESC",
      [userId],
    )
  ).rows;
  for (const row of queue) {
    const message = JSON.parse(unseal(row.encrypted_message, f.app.locals.encryptionKey));
    const match = message.text.match(/https?:\/\/\S+/);
    if (match) {
      const params = new URLSearchParams(new URL(match[0]).hash.slice(1));
      if (params.get('purpose') === purpose) return params.get('token');
    }
  }
  throw new Error('Token email not queued');
}
it('signs out only the current browser and preserves explicit sign-out-everywhere', async () => {
  const account = await f.account('client');
  const second = supertest.agent(f.app);
  await f
    .mutation(second.post('/api/auth/login'))
    .send({ email: account.email, password: account.password });
  expect((await f.mutation(account.agent.post('/api/auth/logout')).send({})).status).toBe(200);
  expect((await account.agent.get('/api/auth/me')).status).toBe(401);
  expect((await second.get('/api/auth/me')).status).toBe(200);
  await f
    .mutation(account.agent.post('/api/auth/login'))
    .send({ email: account.email, password: account.password });
  expect((await f.mutation(second.post('/api/security/revoke-all')).send({})).status).toBe(200);
  expect((await account.agent.get('/api/auth/me')).status).toBe(401);
});
it('tracks browser sessions and revokes only the selected device', async () => {
  const account = await f.account('client');
  const second = supertest.agent(f.app);
  expect(
    (
      await f
        .mutation(second.post('/api/auth/login'))
        .send({ email: account.email, password: account.password })
    ).status,
  ).toBe(200);
  const sessions = (await account.agent.get('/api/security')).body.sessions;
  expect(sessions).toHaveLength(2);
  const other = sessions.find((s) => !s.current);
  expect(
    (await f.mutation(account.agent.delete('/api/security/sessions/' + other.id))).status,
  ).toBe(200);
  expect((await second.get('/api/auth/me')).status).toBe(401);
  expect((await account.agent.get('/api/auth/me')).status).toBe(200);
  expect(
    (await f.mutation(f.outsider.agent.delete('/api/security/sessions/' + sessions[0].id))).status,
  ).toBe(404);
});
it('enrolls MFA, revokes previous sessions, requires a second factor and consumes recovery codes once', async () => {
  mfaAccount = await f.account('client');
  const old = supertest.agent(f.app);
  await f
    .mutation(old.post('/api/auth/login'))
    .send({ email: mfaAccount.email, password: mfaAccount.password });
  expect(
    (await f.mutation(mfaAccount.agent.post('/api/security/mfa/setup')).send({ password: 'wrong' }))
      .status,
  ).toBe(401);
  const setup = await f
    .mutation(mfaAccount.agent.post('/api/security/mfa/setup'))
    .send({ password: mfaAccount.password });
  expect(setup.status).toBe(200);
  expect(setup.body.uri).toContain('otpauth://totp/');
  expect(
    (
      await f
        .mutation(mfaAccount.agent.post('/api/security/mfa/confirm'))
        .send({ code: 'not-a-code' })
    ).status,
  ).toBe(400);
  const enabled = await f
    .mutation(mfaAccount.agent.post('/api/security/mfa/confirm'))
    .send({ code: totp(setup.body.secret) });
  expect(enabled.status, JSON.stringify(enabled.body)).toBe(200);
  recoveryCodes = enabled.body.recoveryCodes;
  expect(recoveryCodes).toHaveLength(8);
  expect((await old.get('/api/auth/me')).status).toBe(401);
  expect((await mfaAccount.agent.get('/api/security')).body.mfaEnabled).toBe(true);
  const stored = (
    await f.pool.query('SELECT mfa_secret,recovery_hashes FROM venue_app.users WHERE id=$1', [
      mfaAccount.user.id,
    ])
  ).rows[0];
  expect(stored.mfa_secret).not.toContain(setup.body.secret);
  expect(JSON.stringify(stored.recovery_hashes)).not.toContain(recoveryCodes[0]);
  const login = supertest.agent(f.app);
  const credentials = { email: mfaAccount.email, password: mfaAccount.password };
  expect((await f.mutation(login.post('/api/auth/login')).send(credentials)).status).toBe(428);
  expect((await login.get('/api/auth/me')).status).toBe(401);
  // The TOTP used to enroll cannot be replayed during sign-in.
  expect(
    (
      await f
        .mutation(login.post('/api/auth/login'))
        .send({ ...credentials, code: totp(setup.body.secret) })
    ).status,
  ).toBe(401);
  expect(
    (
      await f
        .mutation(login.post('/api/auth/login'))
        .send({ ...credentials, code: recoveryCodes[0] })
    ).status,
  ).toBe(200);
  expect(
    (
      await f
        .mutation(supertest(f.app).post('/api/auth/login'))
        .send({ ...credentials, code: recoveryCodes[0] })
    ).status,
  ).toBe(401);
});
it('queues expiring hashed reset tokens without revealing account existence and preserves MFA on reset', async () => {
  const absent = await f
    .mutation(supertest(f.app).post('/api/auth/forgot-password'))
    .send({ email: 'absent@venue.test' });
  const existing = await f
    .mutation(supertest(f.app).post('/api/auth/forgot-password'))
    .send({ email: mfaAccount.email });
  expect(absent.status).toBe(202);
  expect(existing.body).toEqual(absent.body);
  resetToken = await latestToken(mfaAccount.user.id, 'reset');
  expect(
    (
      await f.pool.query('SELECT id FROM venue_app.account_tokens WHERE token_hash=$1', [
        resetToken,
      ])
    ).rowCount,
  ).toBe(0);
  const payload = { token: resetToken, password: 'ResetEnterprisePassword42!' };
  expect(
    (await f.mutation(supertest(f.app).post('/api/auth/reset-password')).send(payload)).status,
  ).toBe(401);
  expect(
    (
      await f
        .mutation(supertest(f.app).post('/api/auth/reset-password'))
        .send({ ...payload, code: recoveryCodes[1] })
    ).status,
  ).toBe(200);
  expect((await mfaAccount.agent.get('/api/auth/me')).status).toBe(401);
  expect(
    (
      await f
        .mutation(supertest(f.app).post('/api/auth/reset-password'))
        .send({ ...payload, code: recoveryCodes[2] })
    ).status,
  ).toBe(400);
  expect(
    (
      await f
        .mutation(supertest(f.app).post('/api/auth/login'))
        .send({ email: mfaAccount.email, password: mfaAccount.password, code: recoveryCodes[2] })
    ).status,
  ).toBe(401);
  const login = supertest.agent(f.app);
  expect(
    (
      await f
        .mutation(login.post('/api/auth/login'))
        .send({ email: mfaAccount.email, password: payload.password, code: recoveryCodes[2] })
    ).status,
  ).toBe(200);
  expect((await login.get('/api/security')).body.emailVerified).toBe(true);
});
it('verifies email with a single-use token bound to its purpose', async () => {
  const account = await f.account('client');
  expect((await f.mutation(account.agent.post('/api/security/verify-email')).send({})).status).toBe(
    202,
  );
  const token = await latestToken(account.user.id, 'verify');
  expect(
    (
      await f
        .mutation(supertest(f.app).post('/api/auth/reset-password'))
        .send({ token, password: 'DifferentPassword42!' })
    ).status,
  ).toBe(400);
  expect(
    (await f.mutation(supertest(f.app).post('/api/auth/verify-email')).send({ token })).status,
  ).toBe(200);
  expect(
    (await f.mutation(supertest(f.app).post('/api/auth/verify-email')).send({ token })).status,
  ).toBe(400);
  expect((await account.agent.get('/api/security')).body.emailVerified).toBe(true);
});
it('enforces staff MFA while keeping enrollment and logout accessible', async () => {
  const app = createApp({
    pool: f.pool,
    secret: 'staff-policy-test-secret-at-least-32-characters',
    origins: [origin],
    requireStaffMfa: true,
  });
  const staffAccount = await f.account('artist');
  const adminInfo = staffAccount.user;
  const admin = supertest.agent(app);
  expect(
    (
      await f
        .mutation(admin.post('/api/auth/login'))
        .send({ email: adminInfo.email, password: f.client.password })
    ).status,
  ).toBe(200);
  expect((await admin.get('/api/admin/users')).status).toBe(403);
  expect((await admin.get('/api/security')).status).toBe(200);
  expect((await f.mutation(admin.post('/api/auth/logout')).send({})).status).toBe(200);
});
it('paginates and filters accounts and bookings without leaking another client’s records', async () => {
  const users = await f.admin.get('/api/admin/users').query({ role: 'client', limit: 2, page: 1 });
  expect(users.status).toBe(200);
  expect(users.body.users).toHaveLength(2);
  expect(users.body.users.every((u) => u.role === 'client')).toBe(true);
  expect(users.body.pagination.total).toBeGreaterThan(2);
  expect((await f.admin.get('/api/admin/users').query({ limit: 201 })).status).toBe(400);
  const booking = await f
    .mutation(f.client.agent.post('/api/bookings'))
    .send({ ...f.bookingInput, idempotencyKey: randomUUID() });
  expect(booking.status).toBe(201);
  const list = await f.client.agent
    .get('/api/bookings-search')
    .query({ search: 'Botanical', limit: 1 });
  expect(list.status, JSON.stringify(list.body)).toBe(200);
  expect(list.body.bookings[0].artist_name).toContain('QA Artist');
  expect(
    (await f.outsider.agent.get('/api/bookings-search').query({ search: 'Botanical' })).body
      .pagination.total,
  ).toBe(0);
  const exportResponse = await f.admin.get('/api/admin/reports/bookings.csv').query({ limit: 1 });
  expect(exportResponse.status).toBe(200);
  expect(exportResponse.text).toContain('Artist');
  expect(exportResponse.text).toContain('Botanical');
  expect((await f.client.agent.get('/api/admin/reports')).status).toBe(403);
  expect((await f.admin.get('/api/admin/reports')).status).toBe(200);
});
it('exports only the requester’s data and tracks privacy requests with validated outcomes', async () => {
  const exported = await f.client.agent.get('/api/account/export');
  expect(exported.status).toBe(200);
  expect(exported.body.account[0].id).toBe(f.client.user.id);
  expect(exported.body.account[0].password_hash).toBeUndefined();
  expect(JSON.stringify(exported.body)).not.toContain(f.outsider.email);
  const created = await f
    .mutation(f.client.agent.post('/api/account/privacy-requests'))
    .send({ kind: 'correction', reason: 'Please correct my appointment contact details.' });
  expect(created.status).toBe(201);
  const url = '/api/admin/privacy-requests/' + created.body.request.id;
  expect(
    (
      await f
        .mutation(f.client.agent.patch(url))
        .send({ status: 'resolved', resolution: 'Completed correction.' })
    ).status,
  ).toBe(403);
  expect(
    (await f.mutation(f.admin.patch(url)).send({ status: 'resolved', resolution: '' })).status,
  ).toBe(400);
  expect(
    (
      await f
        .mutation(f.admin.patch(url))
        .send({ status: 'resolved', resolution: 'Corrected the contact details requested.' })
    ).status,
  ).toBe(200);
  expect((await f.client.agent.get('/api/account/privacy-requests')).body.requests[0].status).toBe(
    'resolved',
  );
});
it('schedules notifications once, retries delivery with the same provider idempotency key and records heartbeats', async () => {
  const key = f.app.locals.encryptionKey;
  const options = {
    key,
    siteUrl: 'https://venue.test',
    transport: async () => {
      throw new Error('secret provider error must not be retained');
    },
  };
  await runOperations(f.pool, options);
  const queued = (
    await f.pool.query(
      "SELECT * FROM venue_app.email_outbox WHERE user_id=ANY($1::uuid[]) AND state='pending'",
      [f.users],
    )
  ).rows;
  expect(queued.length).toBeGreaterThan(0);
  expect(queued.some((q) => q.last_error === 'delivery_error')).toBe(true);
  expect(queued.every((q) => q.encrypted_message && !q.encrypted_message.includes('http'))).toBe(
    true,
  );
  await f.pool.query(
    "UPDATE venue_app.email_outbox SET available_at=now() WHERE user_id=ANY($1::uuid[]) AND state='pending'",
    [f.users],
  );
  const delivered = [];
  const success = {
    key,
    siteUrl: 'https://venue.test',
    transport: async (message) => delivered.push(message.id),
  };
  await Promise.all([runOperations(f.pool, success), runOperations(f.pool, success)]);
  expect(new Set(delivered).size).toBe(delivered.length);
  expect(delivered.length).toBeGreaterThan(0);
  const before = delivered.length;
  await runOperations(f.pool, success);
  expect(delivered.length).toBe(before);
  const operations = await f.admin.get('/api/admin/operations');
  expect(operations.status).toBe(200);
  expect(operations.body.workerHealthy).toBe(true);
  expect(operations.body.checks.some((c) => c.label === 'Organization SSO')).toBe(false);
});
it('submits complete email messages and rejects transport or per-message failures', async () => {
  let observed;
  const message = {
    id: randomUUID(),
    to: 'recipient@venue.test',
    subject: 'Hello',
    text: 'A message',
  };
  const options = {
    apiKey: 'test-key',
    secretKey: 'test-secret',
    fromEmail: 'sender@venue.test',
    fromName: 'Venue',
  };
  await mailjetTransport(message, {
    ...options,
    fetcher: async (url, request) => {
      observed = { url, ...request };
      return { ok: true, json: async () => ({ Messages: [{ Status: 'success' }] }) };
    },
  });
  expect(observed.url).toBe('https://api.mailjet.com/v3.1/send');
  expect(observed.headers.Authorization).toBe(
    'Basic ' + Buffer.from('test-key:test-secret').toString('base64'),
  );
  const payload = JSON.parse(observed.body).Messages[0];
  expect(payload.From).toEqual({ Email: 'sender@venue.test', Name: 'Venue' });
  expect(payload.To).toEqual([{ Email: message.to }]);
  expect(payload.Subject).toBe(message.subject);
  expect(payload.TextPart).toBe(message.text);
  expect(payload.CustomID).toBe(message.id);
  expect(payload.CustomCampaign).toBe(message.id);
  expect(payload.DeduplicateCampaign).toBe(true);
  await expect(
    mailjetTransport(message, { ...options, fetcher: async () => ({ ok: false, status: 429 }) }),
  ).rejects.toThrow('mail_http_429');
  await expect(
    mailjetTransport(message, {
      ...options,
      fetcher: async () => ({ ok: true, json: async () => ({ Messages: [{ Status: 'error' }] }) }),
    }),
  ).rejects.toThrow('mail_rejected');
});

it('persists sign-in throttling across application instances', async () => {
  const account = await f.account('client');
  const options = {
    pool: f.pool,
    secret: 'shared-auth-throttle-secret-at-least-32-characters',
    origins: [origin],
    limit: 1000,
  };
  const one = createApp(options),
    two = createApp(options);
  for (let i = 0; i < 10; i++) {
    const app = i % 2 ? one : two;
    expect(
      (
        await f
          .mutation(supertest(app).post('/api/auth/login'))
          .send({ email: account.email, password: 'WrongPassword42!' })
      ).status,
    ).toBe(401);
  }
  expect(
    (
      await f
        .mutation(supertest(one).post('/api/auth/login'))
        .send({ email: account.email, password: account.password })
    ).status,
  ).toBe(429);
});

it('schedules a confirmed appointment reminder once and honors booking-email opt-out', async () => {
  const booking = await f
    .mutation(f.client.agent.post('/api/bookings'))
    .send({ ...f.bookingInput, idempotencyKey: randomUUID() });
  expect(booking.status).toBe(201);
  const bookingId = booking.body.booking.id;
  await f.pool.query(
    "UPDATE venue_app.bookings SET status='confirmed',starts_at=now()+interval '12 hours',ends_at=now()+interval '13 hours' WHERE id=$1",
    [bookingId],
  );
  const options = {
    key: f.app.locals.encryptionKey,
    siteUrl: 'https://venue.test',
    transport: null,
  };
  await runOperations(f.pool, options);
  await runOperations(f.pool, options);
  expect(
    (
      await f.pool.query('SELECT * FROM venue_app.booking_reminders WHERE booking_id=$1', [
        bookingId,
      ])
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await f.pool.query('SELECT id FROM venue_app.email_outbox WHERE dedupe_key LIKE $1', [
        'reminder:' + bookingId + ':%',
      ])
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await f
        .mutation(f.client.agent.patch('/api/security/preferences'))
        .send({ emailNotifications: false })
    ).status,
  ).toBe(200);
  const notificationId = randomUUID();
  await f.pool.query(
    "INSERT INTO venue_app.notifications(id,user_id,title,body) VALUES($1,$2,'Private booking update','Private message contents')",
    [notificationId, f.client.user.id],
  );
  await runOperations(f.pool, options);
  expect(
    (
      await f.pool.query('SELECT id FROM venue_app.email_outbox WHERE dedupe_key=$1', [
        'notification:' + notificationId,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await f.pool.query('SELECT email_scheduled FROM venue_app.notifications WHERE id=$1', [
        notificationId,
      ])
    ).rows[0].email_scheduled,
  ).toBe(true);
});
