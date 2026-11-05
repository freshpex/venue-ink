import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { transaction } from './db.mjs';
import { HttpError, parse, registration, login, password } from './validation.mjs';
import { userFields, audit } from './domain.mjs';
import { publicRoutes } from './routes/public.mjs';
import { bookingRoutes } from './routes/bookings.mjs';
import { workspaceRoutes } from './routes/workspace.mjs';
import { ssoRoutes, configuredOidc } from './routes/sso.mjs';
import { accessRoutes } from './routes/access.mjs';
import { securityRoutes } from './routes/security.mjs';
import { checkSecondFactor, digest } from './security.mjs';
import { enterpriseRoutes } from './routes/enterprise.mjs';
import { adminRoutes } from './routes/admin.mjs';
export function createApp({
  pool,
  secret,
  origins,
  production = false,
  securityHeaders = production,
  limit = 20,
  oidcProvider,
  oidcDomains = (process.env.OIDC_ALLOWED_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  encryptionKey = process.env.DATA_ENCRYPTION_KEY || secret,
  siteUrl = process.env.SITE_URL || origins[0],
  apiUrl = process.env.API_PUBLIC_URL || siteUrl,
  requireStaffMfa = process.env.REQUIRE_STAFF_MFA === 'true',
  logger = production ? (entry) => console.info(JSON.stringify(entry)) : () => {},
  isReady = () => true,
}) {
  if (!secret || secret.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');
  const app = express();
  app.disable('x-powered-by');
  app.locals.encryptionKey = encryptionKey;
  app.locals.siteUrl = siteUrl.replace(/\/$/, '');
  app.locals.requireStaffMfa = requireStaffMfa;
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    const start = performance.now();
    const requestPath = req.path;
    res.on('finish', () => {
      if (requestPath.startsWith('/api'))
        logger({
          event: 'http.request',
          requestId: req.requestId,
          method: req.method,
          route: req.route?.path || 'unmatched',
          path: requestPath,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - start),
        });
    });
    next();
  });
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: securityHeaders
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", 'https://*.tawk.to', 'https://cdn.jsdelivr.net'],
              styleSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://*.tawk.to',
                'https://fonts.googleapis.com',
                'https://cdn.jsdelivr.net',
              ],
              imgSrc: [
                "'self'",
                'data:',
                'blob:',
                'https://*.tawk.to',
                'https://cdn.jsdelivr.net',
                'https://tawk.link',
                'https://s3.amazonaws.com',
              ],
              connectSrc: ["'self'", ...origins, 'https://*.tawk.to', 'wss://*.tawk.to'],
              fontSrc: ["'self'", 'https://*.tawk.to', 'https://fonts.gstatic.com'],
              frameSrc: ["'self'", 'mailto:', 'https://*.tawk.to'],
              formAction: ["'self'", 'https://*.tawk.to'],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
      credentials: true,
      exposedHeaders: ['X-Venue-Session'],
    }),
  );
  app.use(express.json({ limit: '9mb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health/live', (_req, res) => res.json({ alive: true, service: 'venue' }));
  app.use('/api', (_req, res, next) => {
    if (isReady()) return next();
    res.set('Retry-After', '3');
    res.status(503).json({ ready: false, message: 'The server is preparing your workspace.' });
  });
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1 FROM venue_app.settings LIMIT 1');
      res.json({ ready: true, service: 'venue' });
    } catch {
      res.status(503).json({ ready: false, message: 'The server is connecting to the database.' });
    }
  });
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (
      req.get('X-Requested-With') !== 'VenueWorkspace' ||
      !origins.includes(req.get('Origin') || '')
    )
      return res.status(403).json({ message: 'Request origin is not allowed.' });
    next();
  });
  const options = {
    httpOnly: true,
    secure: production,
    sameSite: production ? process.env.COOKIE_SAME_SITE || 'lax' : 'lax',
    path: '/api',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  const issue = async (req, res, user) => {
    const sessionId = randomUUID();
    await pool.query(
      'INSERT INTO venue_app.sessions(id,user_id,user_agent,expires_at) VALUES($1,$2,$3,$4)',
      [
        sessionId,
        user.id,
        (req.get('User-Agent') || 'Unknown browser').slice(0, 300),
        new Date(Date.now() + options.maxAge),
      ],
    );
    const token = jwt.sign({ sub: user.id, sv: user.session_version, jti: sessionId }, secret, {
      expiresIn: '7d',
      issuer: 'venue',
      audience: 'venue-account',
      algorithm: 'HS256',
    });
    res.cookie('venue_session', token, options);
    if (req.get('X-Venue-Session') === 'browser' && origins.includes(req.get('Origin') || ''))
      res.set('X-Venue-Session', token);
  };
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many sign-in attempts. Please try again in a few minutes.' },
  });
  const writeLimiter = rateLimit({
    windowMs: 60000,
    limit: 90,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Please wait a moment before making more changes.' },
  });
  const fallbackHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);
  const optionalAuth = async (req, _res, next) => {
    const authorization = req.get('Authorization');
    const token = authorization
      ? /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization)?.[1]
      : req.cookies.venue_session;
    if (!token) return next();
    try {
      const claims = jwt.verify(token, secret, {
        issuer: 'venue',
        audience: 'venue-account',
        algorithms: ['HS256'],
      });
      const user = (
        await pool.query(
          `SELECT ${userFields},active,session_version,(mfa_secret IS NOT NULL) AS mfa_enabled FROM venue_app.users WHERE id=$1`,
          [claims.sub],
        )
      ).rows[0];
      if (
        user?.active &&
        user.session_version === claims.sv &&
        typeof claims.jti === 'string' &&
        /^[0-9a-f-]{36}$/.test(claims.jti)
      ) {
        const session = (
          await pool.query(
            'SELECT id FROM venue_app.sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()',
            [claims.jti, user.id],
          )
        ).rows[0];
        if (session) {
          req.user = user;
          req.sessionId = session.id;
        }
      }
      next();
    } catch (error) {
      if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name))
        return next();
      next(error);
    }
  };
  app.use('/api', optionalAuth);
  app.post('/api/auth/register', limiter, async (req, res) => {
    const values = parse(registration, req.body);
    const hash = await bcrypt.hash(values.password, 12);
    try {
      const user = await transaction(pool, async (db) => {
        let invitation;
        if (values.invitation) {
          invitation = (
            await db.query(
              'SELECT * FROM venue_app.invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE',
              [createHash('sha256').update(values.invitation).digest('hex')],
            )
          ).rows[0];
          if (!invitation || invitation.email !== values.email)
            throw new HttpError(
              400,
              'This invitation is invalid, expired or belongs to another email address.',
            );
        }
        const role = invitation ? 'artist' : values.role;
        const user = (
          await db.query(
            `INSERT INTO venue_app.users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING ${userFields},session_version`,
            [randomUUID(), values.email, values.name, hash, role],
          )
        ).rows[0];
        if (role === 'artist' || role === 'studio') {
          let studioId = invitation?.studio_id;
          if (!studioId) {
            studioId = randomUUID();
            const zone =
              (await db.query("SELECT timezone FROM venue_app.settings WHERE id='site'")).rows[0]
                ?.timezone || 'UTC';
            await db.query(
              'INSERT INTO venue_app.studios(id,owner_id,name,slug,timezone) VALUES($1,$2,$3,$4,$5)',
              [
                studioId,
                user.id,
                `${values.name} Studio`,
                `${slugify(values.name)}-${user.id.slice(0, 6)}`,
                zone,
              ],
            );
          }
          if (role === 'artist')
            await db.query(
              'INSERT INTO venue_app.artist_profiles(user_id,studio_id,slug,display_name) VALUES($1,$2,$3,$4)',
              [user.id, studioId, `${slugify(values.name)}-${user.id.slice(0, 6)}`, values.name],
            );
          if (invitation)
            await db.query('UPDATE venue_app.invitations SET accepted_at=now() WHERE id=$1', [
              invitation.id,
            ]);
        }
        await audit(db, user, 'account.created', user.id, { role });
        return user;
      });
      await issue(req, res, user);
      res.status(201).json({ user: cleanUser(user) });
    } catch (error) {
      if (error.code === '23505')
        throw new HttpError(409, 'An account already uses those details. Please sign in.');
      throw error;
    }
  });
  app.post('/api/auth/login', limiter, async (req, res) => {
    const values = parse(login.extend({ code: z.string().trim().max(40).default('') }), req.body);
    const attemptKey = digest(secret + ':login:' + values.email + ':' + req.ip);
    const attempt = (
      await pool.query(
        "INSERT INTO venue_app.auth_attempts(key,attempts) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN venue_app.auth_attempts.window_started_at<now()-interval '15 minutes' THEN 1 ELSE venue_app.auth_attempts.attempts+1 END,window_started_at=CASE WHEN venue_app.auth_attempts.window_started_at<now()-interval '15 minutes' THEN now() ELSE venue_app.auth_attempts.window_started_at END RETURNING attempts",
        [attemptKey],
      )
    ).rows[0];
    if (attempt.attempts > 10)
      throw new HttpError(
        429,
        'Too many sign-in attempts for this account. Try again in 15 minutes.',
      );
    const user = (
      await pool.query(
        `SELECT ${userFields},password_hash,session_version,active,mfa_secret,mfa_last_step,recovery_hashes FROM venue_app.users WHERE email=$1`,
        [values.email],
      )
    ).rows[0];
    const valid = await bcrypt.compare(values.password, user?.password_hash || fallbackHash);
    if (!user || !valid || !user.active)
      throw new HttpError(401, 'The email or password is incorrect.');
    if (user.mfa_secret) {
      if (!values.code)
        throw new HttpError(428, 'Enter your authenticator or recovery code to finish signing in.');
      await transaction(pool, async (db) => {
        const locked = (
          await db.query('SELECT * FROM venue_app.users WHERE id=$1 FOR UPDATE', [user.id])
        ).rows[0];
        if (!locked.active || locked.password_hash !== user.password_hash)
          throw new HttpError(401, 'Please sign in again.');
        await checkSecondFactor(db, locked, values.code, encryptionKey);
      });
    }
    await pool.query('DELETE FROM venue_app.auth_attempts WHERE key=$1', [attemptKey]);
    await issue(req, res, user);
    res.json({ user: cleanUser(user) });
  });
  const ssoProvider =
    oidcProvider ??
    configuredOidc({
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      redirectUri: apiUrl.replace(/\/$/, '') + '/api/auth/sso/callback',
    });
  app.locals.ssoEnabled = !!ssoProvider;
  ssoRoutes(app, {
    pool,
    key: encryptionKey,
    siteUrl: app.locals.siteUrl,
    apiUrl: apiUrl.replace(/\/$/, ''),
    issue,
    limiter,
    production,
    provider: ssoProvider,
    domains: oidcDomains,
  });
  securityRoutes(app, { pool, key: encryptionKey, siteUrl: app.locals.siteUrl, issue, limiter });
  publicRoutes(app, { pool, writeLimiter });
  app.use('/api', (req, res, next) =>
    req.user ? next() : res.status(401).json({ message: 'Sign in to continue.' }),
  );
  app.get('/api/auth/me', (req, res) => res.json({ user: cleanUser(req.user) }));
  app.post('/api/auth/logout', async (req, res) => {
    await pool.query(
      'UPDATE venue_app.sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',
      [req.sessionId, req.user.id],
    );
    res.clearCookie('venue_session', { ...options, maxAge: undefined });
    res.json({ ok: true });
  });
  app.patch('/api/auth/password', limiter, async (req, res) => {
    const values = parse(
      z
        .object({
          currentPassword: z.string().min(1).max(128),
          newPassword: password,
          code: z.string().trim().max(40).default(''),
        })
        .strict(),
      req.body,
    );
    const hash = await bcrypt.hash(values.newPassword, 12);
    const updated = await transaction(pool, async (db) => {
      const stored = (
        await db.query('SELECT * FROM venue_app.users WHERE id=$1 FOR UPDATE', [req.user.id])
      ).rows[0];
      if (!(await bcrypt.compare(values.currentPassword, stored.password_hash)))
        throw new HttpError(400, 'Your current password is incorrect.');
      await checkSecondFactor(db, stored, values.code, encryptionKey);
      const result = (
        await db.query(
          'UPDATE venue_app.users SET password_hash=$1,session_version=session_version+1,updated_at=now() WHERE id=$2 RETURNING id,session_version',
          [hash, req.user.id],
        )
      ).rows[0];
      await audit(db, req.user, 'password.changed', req.user.id);
      return result;
    });
    await issue(req, res, updated);
    res.json({ ok: true });
  });
  app.use('/api', writeLimiter);
  securityRoutes(app, {
    pool,
    key: encryptionKey,
    siteUrl: app.locals.siteUrl,
    issue,
    limiter,
    authenticated: true,
  });
  app.use('/api', (req, _res, next) => {
    if (requireStaffMfa && req.user.role !== 'client' && !req.user.mfa_enabled)
      return next(
        new HttpError(
          403,
          'Set up two-factor authentication in Security before accessing the staff workspace.',
        ),
      );
    next();
  });
  accessRoutes(app, { pool });
  enterpriseRoutes(app, { pool });
  bookingRoutes(app, { pool });
  workspaceRoutes(app, { pool });
  adminRoutes(app, { pool });
  app.use('/api', (_req, res) =>
    res.status(404).json({ message: 'This route could not be found.' }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof HttpError)
      return res.status(error.status).json({ message: error.message, requestId: req.requestId });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ message: 'The uploaded information is too large.' });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ message: 'The request could not be read.' });
    if (error.code === '23505')
      return res.status(409).json({ message: 'A record already uses those details.' });
    if (error.code === '23503')
      return res.status(409).json({ message: 'This record is still connected to other records.' });
    logger({ event: 'api.error', requestId: req.requestId, code: error.code || error.name });
    res.status(503).json({
      message: 'The server could not complete this request. Please try again.',
      requestId: req.requestId,
    });
  });
  return app;
}
export function cleanUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at,
    mfaEnabled: user.mfa_enabled ?? !!user.mfa_secret,
  };
}
export function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70) || 'artist'
  );
}
