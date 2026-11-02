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
import { adminRoutes } from './routes/admin.mjs';
export function createApp({ pool, secret, origins, production = false,securityHeaders=production, limit = 20 }) {
  if (!secret || secret.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');
  const app = express();
  app.disable('x-powered-by');
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
              frameSrc: ["'self'", 'https://*.tawk.to'],
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
    }),
  );
  app.use(express.json({ limit: '9mb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
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
    sameSite: production ? process.env.COOKIE_SAME_SITE || 'none' : 'lax',
    path: '/api',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  const issue = (res, user) =>
    res.cookie(
      'venue_session',
      jwt.sign({ sub: user.id, sv: user.session_version }, secret, {
        expiresIn: '7d',
        issuer: 'venue',
        audience: 'venue-account',
        algorithm: 'HS256',
      }),
      options,
    );
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
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Please wait a moment before making more changes.' },
  });
  const fallbackHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);
  const optionalAuth = async (req, _res, next) => {
    const token = req.cookies.venue_session;
    if (!token) return next();
    try {
      const claims = jwt.verify(token, secret, {
        issuer: 'venue',
        audience: 'venue-account',
        algorithms: ['HS256'],
      });
      const user = (
        await pool.query(
          `SELECT ${userFields},active,session_version FROM venue_app.users WHERE id=$1`,
          [claims.sub],
        )
      ).rows[0];
      if (user?.active && user.session_version === claims.sv) req.user = user;
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
      issue(res, user);
      res.status(201).json({ user: cleanUser(user) });
    } catch (error) {
      if (error.code === '23505')
        throw new HttpError(409, 'An account already uses those details. Please sign in.');
      throw error;
    }
  });
  app.post('/api/auth/login', limiter, async (req, res) => {
    const values = parse(login, req.body);
    const user = (
      await pool.query(
        `SELECT ${userFields},password_hash,session_version,active FROM venue_app.users WHERE email=$1`,
        [values.email],
      )
    ).rows[0];
    const valid = await bcrypt.compare(values.password, user?.password_hash || fallbackHash);
    if (!user || !valid || !user.active)
      throw new HttpError(401, 'The email or password is incorrect.');
    issue(res, user);
    res.json({ user: cleanUser(user) });
  });
  publicRoutes(app, { pool, writeLimiter });
  app.use('/api', (req, res, next) =>
    req.user ? next() : res.status(401).json({ message: 'Sign in to continue.' }),
  );
  app.get('/api/auth/me', (req, res) => res.json({ user: cleanUser(req.user) }));
  app.post('/api/auth/logout', async (req, res) => {
    await pool.query('UPDATE venue_app.users SET session_version=session_version+1 WHERE id=$1', [
      req.user.id,
    ]);
    res.clearCookie('venue_session', { ...options, maxAge: undefined });
    res.json({ ok: true });
  });
  app.patch('/api/auth/password', limiter, async (req, res) => {
    const values = parse(
      z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict(),
      req.body,
    );
    const stored = (
      await pool.query('SELECT password_hash FROM venue_app.users WHERE id=$1', [req.user.id])
    ).rows[0];
    if (!(await bcrypt.compare(values.currentPassword, stored.password_hash)))
      throw new HttpError(400, 'Your current password is incorrect.');
    const hash = await bcrypt.hash(values.newPassword, 12);
    const updated = (
      await pool.query(
        'UPDATE venue_app.users SET password_hash=$1,session_version=session_version+1,updated_at=now() WHERE id=$2 RETURNING id,session_version',
        [hash, req.user.id],
      )
    ).rows[0];
    issue(res, updated);
    await audit(pool, req.user, 'password.changed', req.user.id);
    res.json({ ok: true });
  });
  app.use('/api', writeLimiter);
  bookingRoutes(app, { pool });
  workspaceRoutes(app, { pool });
  adminRoutes(app, { pool });
  app.use('/api', (_req, res) =>
    res.status(404).json({ message: 'This route could not be found.' }),
  );
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof HttpError)
      return res.status(error.status).json({ message: error.message });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ message: 'The uploaded information is too large.' });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ message: 'The request could not be read.' });
    if (error.code === '23505')
      return res.status(409).json({ message: 'A record already uses those details.' });
    if (error.code === '23503')
      return res.status(409).json({ message: 'This record is still connected to other records.' });
    console.error('API operation failed:', error.code || error.name);
    res
      .status(503)
      .json({ message: 'The server could not complete this request. Please try again.' });
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
