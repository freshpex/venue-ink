import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { transaction } from '../db.mjs';
import { audit } from '../domain.mjs';
import { HttpError, parse, email, password, id } from '../validation.mjs';
import {
  authenticatorSecret,
  matchingStep,
  checkSecondFactor,
  digest,
  seal,
  unseal,
} from '../security.mjs';
import { enqueueEmail } from '../mail.mjs';

const code = z.string().trim().max(40).default('');
export function securityRoutes(app, { pool, key, siteUrl, issue, limiter, authenticated = false }) {
  const tokenInput = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'This link is invalid or expired.');
  async function tokenFor(db, user, purpose) {
    const recent = (
      await db.query(
        "SELECT id FROM venue_app.account_tokens WHERE user_id=$1 AND purpose=$2 AND created_at>now()-interval '1 minute'",
        [user.id, purpose],
      )
    ).rowCount;
    if (recent) return;
    await db.query(
      'UPDATE venue_app.account_tokens SET used_at=now() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL',
      [user.id, purpose],
    );
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + (purpose === 'reset' ? 30 : 24 * 60) * 60000);
    const tokenId = randomUUID();
    await db.query(
      'INSERT INTO venue_app.account_tokens(id,user_id,purpose,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)',
      [tokenId, user.id, purpose, digest(token), expiresAt],
    );
    await enqueueEmail(db, key, {
      userId: user.id,
      to: user.email,
      subject: purpose === 'reset' ? 'Reset your Venue password' : 'Verify your Venue email',
      text:
        (purpose === 'reset' ? 'Reset your password' : 'Verify your email') +
        ': ' +
        siteUrl +
        '/account-access#' +
        new URLSearchParams({ purpose, token }) +
        '\nThis link expires ' +
        expiresAt.toISOString() +
        '. If you did not request this, ignore this email.',
      dedupeKey: 'account-token:' + tokenId,
      expiresAt: expiresAt.toISOString(),
    });
  }
  if (!authenticated) {
    app.post('/api/auth/forgot-password', limiter, async (req, res) => {
      const v = parse(z.object({ email }).strict(), req.body);
      await transaction(pool, async (db) => {
        const user = (
          await db.query(
            'SELECT id,email FROM venue_app.users WHERE email=$1 AND active=true FOR UPDATE',
            [v.email],
          )
        ).rows[0];
        if (user) await tokenFor(db, user, 'reset');
      });
      res.status(202).json({
        message:
          'If this account is eligible, a password reset link will be emailed. Check your inbox.',
      });
    });
    app.post('/api/auth/reset-password', limiter, async (req, res) => {
      const v = parse(z.object({ token: tokenInput, password, code }).strict(), req.body);
      const hash = await bcrypt.hash(v.password, 12);
      await transaction(pool, async (db) => {
        const token = (
          await db.query(
            "SELECT * FROM venue_app.account_tokens WHERE token_hash=$1 AND purpose='reset' AND used_at IS NULL AND expires_at>now() FOR UPDATE",
            [digest(v.token)],
          )
        ).rows[0];
        if (!token) throw new HttpError(400, 'This link is invalid or expired.');
        const user = (
          await db.query('SELECT * FROM venue_app.users WHERE id=$1 AND active=true FOR UPDATE', [
            token.user_id,
          ])
        ).rows[0];
        if (!user) throw new HttpError(400, 'This link is invalid or expired.');
        await checkSecondFactor(db, user, v.code, key);
        await db.query(
          'UPDATE venue_app.users SET password_hash=$1,session_version=session_version+1,email_verified_at=COALESCE(email_verified_at,now()),updated_at=now() WHERE id=$2',
          [hash, user.id],
        );
        await db.query(
          "UPDATE venue_app.account_tokens SET used_at=now() WHERE user_id=$1 AND purpose='reset' AND used_at IS NULL",
          [user.id],
        );
        await db.query(
          'UPDATE venue_app.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
          [user.id],
        );
        await audit(db, user, 'password.reset', user.id);
      });
      res.json({ ok: true });
    });
    app.post('/api/auth/verify-email', limiter, async (req, res) => {
      const v = parse(z.object({ token: tokenInput }).strict(), req.body);
      await transaction(pool, async (db) => {
        const token = (
          await db.query(
            "SELECT * FROM venue_app.account_tokens WHERE token_hash=$1 AND purpose='verify' AND used_at IS NULL AND expires_at>now() FOR UPDATE",
            [digest(v.token)],
          )
        ).rows[0];
        if (!token) throw new HttpError(400, 'This link is invalid or expired.');
        await db.query('UPDATE venue_app.users SET email_verified_at=now() WHERE id=$1', [
          token.user_id,
        ]);
        await db.query('UPDATE venue_app.account_tokens SET used_at=now() WHERE id=$1', [token.id]);
        await audit(db, { id: token.user_id }, 'email.verified', token.user_id);
      });
      res.json({ ok: true });
    });
    return;
  }
  app.get('/api/security', async (req, res) => {
    const u = (
      await pool.query(
        'SELECT email_verified_at,mfa_secret,email_notifications FROM venue_app.users WHERE id=$1',
        [req.user.id],
      )
    ).rows[0];
    const sessions = (
      await pool.query(
        'SELECT id,user_agent,created_at,expires_at FROM venue_app.sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC',
        [req.user.id],
      )
    ).rows;
    res.json({
      emailVerified: !!u.email_verified_at,
      mfaEnabled: !!u.mfa_secret,
      emailNotifications: u.email_notifications,
      sessions: sessions.map((s) => ({ ...s, current: s.id === req.sessionId })),
      requireStaffMfa: app.locals.requireStaffMfa && req.user.role !== 'client',
    });
  });
  app.post('/api/security/verify-email', limiter, async (req, res) => {
    await transaction(pool, async (db) => {
      const user = (
        await db.query(
          'SELECT id,email,email_verified_at FROM venue_app.users WHERE id=$1 FOR UPDATE',
          [req.user.id],
        )
      ).rows[0];
      if (!user.email_verified_at) await tokenFor(db, user, 'verify');
    });
    res.status(202).json({ ok: true });
  });
  app.patch('/api/security/preferences', async (req, res) => {
    const v = parse(z.object({ emailNotifications: z.boolean() }).strict(), req.body);
    await pool.query('UPDATE venue_app.users SET email_notifications=$1 WHERE id=$2', [
      v.emailNotifications,
      req.user.id,
    ]);
    res.json({ ok: true });
  });
  app.delete('/api/security/sessions/:id', async (req, res) => {
    const sessionId = parse(id, req.params.id);
    const result = await pool.query(
      'UPDATE venue_app.sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 RETURNING id',
      [sessionId, req.user.id],
    );
    if (!result.rowCount) throw new HttpError(404, 'Session not found.');
    await audit(pool, req.user, 'session.revoked', sessionId);
    res.json({ ok: true });
  });
  app.post('/api/security/revoke-all', async (req, res) => {
    await pool.query('UPDATE venue_app.users SET session_version=session_version+1 WHERE id=$1', [
      req.user.id,
    ]);
    await pool.query(
      'UPDATE venue_app.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
      [req.user.id],
    );
    await audit(pool, req.user, 'sessions.revoked', req.user.id);
    res.json({ ok: true });
  });
  async function passwordUser(db, req, v) {
    const user = (
      await db.query('SELECT * FROM venue_app.users WHERE id=$1 FOR UPDATE', [req.user.id])
    ).rows[0];
    if (!(await bcrypt.compare(v.password, user.password_hash)))
      throw new HttpError(401, 'Your password is incorrect.');
    return user;
  }
  app.post('/api/security/mfa/setup', limiter, async (req, res) => {
    const v = parse(z.object({ password: z.string().min(1).max(128) }).strict(), req.body);
    const secret = authenticatorSecret();
    await transaction(pool, async (db) => {
      const user = await passwordUser(db, req, v);
      if (user.mfa_secret)
        throw new HttpError(409, 'Two-factor authentication is already enabled.');
      await db.query(
        "UPDATE venue_app.users SET mfa_pending_secret=$1,mfa_pending_expires_at=now()+interval '10 minutes' WHERE id=$2",
        [seal(secret, key), user.id],
      );
    });
    res.json({
      secret,
      uri:
        'otpauth://totp/' +
        encodeURIComponent('Venue:' + req.user.email) +
        '?' +
        new URLSearchParams({
          secret,
          issuer: 'Venue',
          algorithm: 'SHA1',
          digits: '6',
          period: '30',
        }),
    });
  });
  app.post('/api/security/mfa/confirm', limiter, async (req, res) => {
    const v = parse(z.object({ code: z.string().regex(/^\d{6}$/) }).strict(), req.body);
    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(8).toString('hex').toUpperCase(),
    );
    const user = await transaction(pool, async (db) => {
      const user = (
        await db.query('SELECT * FROM venue_app.users WHERE id=$1 FOR UPDATE', [req.user.id])
      ).rows[0];
      if (
        !user.mfa_pending_secret ||
        new Date(user.mfa_pending_expires_at) <= new Date() ||
        user.mfa_secret
      )
        throw new HttpError(400, 'Start a new authenticator setup.');
      const step = matchingStep(unseal(user.mfa_pending_secret, key), v.code);
      if (step === null)
        throw new HttpError(400, 'Enter the current six-digit code from your authenticator.');
      const updated = (
        await db.query(
          'UPDATE venue_app.users SET mfa_secret=mfa_pending_secret,mfa_pending_secret=NULL,mfa_pending_expires_at=NULL,mfa_last_step=$1,recovery_hashes=$2,session_version=session_version+1 WHERE id=$3 RETURNING id,session_version',
          [step, JSON.stringify(recoveryCodes.map(digest)), user.id],
        )
      ).rows[0];
      await audit(db, req.user, 'mfa.enabled', user.id);
      return updated;
    });
    await issue(req, res, user);
    res.json({ recoveryCodes });
  });
  app.post('/api/security/mfa/disable', limiter, async (req, res) => {
    const v = parse(z.object({ password: z.string().min(1).max(128), code }).strict(), req.body);
    const user = await transaction(pool, async (db) => {
      const user = await passwordUser(db, req, v);
      if (app.locals.requireStaffMfa && user.role !== 'client')
        throw new HttpError(403, 'Your organization requires two-factor authentication for staff.');
      if (!user.mfa_secret) throw new HttpError(409, 'Two-factor authentication is not enabled.');
      await checkSecondFactor(db, user, v.code, key);
      const updated = (
        await db.query(
          "UPDATE venue_app.users SET mfa_secret=NULL,mfa_last_step=-1,recovery_hashes='[]',session_version=session_version+1 WHERE id=$1 RETURNING id,session_version",
          [user.id],
        )
      ).rows[0];
      await audit(db, req.user, 'mfa.disabled', user.id);
      return updated;
    });
    await issue(req, res, user);
    res.json({ ok: true });
  });
}
