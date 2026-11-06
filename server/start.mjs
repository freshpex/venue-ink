import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { createPool, migrateDatabase } from './db.mjs';
import { seedDatabase } from './seed.mjs';
import { startOperations, mailjetTransport } from './mail.mjs';
import { createApp } from './app.mjs';
import { verifyProfileStorage } from './profile-storage.mjs';
import { startAssetCleanup } from './asset-storage.mjs';
if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error('DATABASE_URL and JWT_SECRET are required.');
  process.exit(1);
}
const origins = (
  process.env.CLIENT_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.CLIENT_ORIGINS || origins.some((o) => !o.startsWith('https://')))) {
  console.error('Production requires explicit HTTPS CLIENT_ORIGINS.');
  process.exit(1);
}
if (
  production &&
  (!process.env.DATA_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY.length < 32)
) {
  console.error('Production requires a stable DATA_ENCRYPTION_KEY of at least 32 characters.');
  process.exit(1);
}
const siteUrl = process.env.SITE_URL || origins[0];
const apiUrl = process.env.API_PUBLIC_URL || siteUrl;
try {
  for (const value of [siteUrl, apiUrl]) {
    const url = new URL(value);
    if (
      production &&
      (url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== '/')
    )
      throw new Error();
  }
} catch {
  console.error('SITE_URL and API_PUBLIC_URL must be valid origins, using HTTPS in production.');
  process.exit(1);
}
let ready = false;
const pool = createPool();
const app = createApp({
  pool,
  secret: process.env.JWT_SECRET,
  origins,
  apiUrl,
  production,
  securityHeaders: production || process.env.SECURITY_HEADERS === 'true',
  isReady: () => ready,
});
let stopWorker = async () => {};
let stopAssetCleanup = async () => {};
const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));
const dist = fileURLToPath(new URL('../dist', import.meta.url));
app.get('/venue-config.js', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  // A server-hosted build always uses its own API, including when build variables are stale.
  res.type('application/javascript').send('window.__VENUE_CONFIG__={"apiBase":"","appOrigin":""};');
});
if (new URL(siteUrl).origin !== new URL(apiUrl).origin) {
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.redirect(302, new URL(siteUrl).origin + req.originalUrl);
  });
}
if ((production || process.env.SERVE_DIST === 'true') && existsSync(`${dist}/index.html`)) {
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    if (
      /^\/(admin|dashboard|bookings|workspace|login|register|account-access)(\/|$)/.test(req.path)
    ) {
      res.set('Cache-Control', 'no-store');
      res.set('X-Robots-Tag', 'noindex,nofollow');
      return next();
    }
    const path = resolve(dist, '.' + decodeURIComponent(req.path), 'index.html');
    if (path.startsWith(resolve(dist) + sep) && existsSync(path)) return res.sendFile(path);
    next();
  });
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => res.sendFile(`${dist}/index.html`));
} else app.use('/images', express.static(`${publicDirectory}/images`, { maxAge: '1h' }));
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
let shuttingDown = false;
const server = app.listen(port, '0.0.0.0');
const listening = new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    ready = false;
    server.close(async () => {
      await stopAssetCleanup();
      await stopWorker();
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
try {
  await listening;
  console.log(`Venue HTTP server is listening on 0.0.0.0:${port}; initializing the database.`);
} catch (error) {
  console.error('HTTP startup failed:', error.code || error.name);
  await pool.end();
  process.exit(1);
}
const migrationPool = createPool(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, {
  direct: true,
});
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    await migrateDatabase(migrationPool);
    await seedDatabase(migrationPool);
    if (process.env.VERIFY_PROFILE_STORAGE === 'true') {
      await migrationPool.query('SELECT artist_id FROM venue_app.services LIMIT 0');
      await migrationPool.query('SELECT bucket,data FROM venue_app.assets LIMIT 0');
      await migrationPool.query('SELECT image_url FROM venue_app.users LIMIT 0');
      await migrationPool.query('SELECT image_url FROM venue_app.studios LIMIT 0');
      const appliedMigrations = Number(
        (await migrationPool.query('SELECT count(*) AS count FROM venue_app.schema_migrations'))
          .rows[0].count,
      );
      const status = await verifyProfileStorage(app.locals.profileStorage, migrationPool);
      console.log(
        JSON.stringify({ event: 'deployment.profile_storage', appliedMigrations, ...status }),
      );
    }
    if (!shuttingDown) ready = true;
    break;
  } catch (error) {
    console.error(`Database startup attempt ${attempt}/5:`, error.code || error.name);
    if (attempt < 5)
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 2000, 10000)));
  }
}
await migrationPool.end();
if (!ready) {
  console.error('The database could not be initialized.');
  process.exit(1);
}
stopAssetCleanup = startAssetCleanup(pool, app.locals.profileStorage);
stopWorker =
  process.env.NODE_ENV === 'test' || process.env.WORKER_ENABLED === 'false'
    ? async () => {}
    : startOperations(pool, {
        key: app.locals.encryptionKey,
        siteUrl: siteUrl.replace(/\/$/, ''),
        transport:
          process.env.MAILJET_API_KEY &&
          process.env.MAILJET_SECRET_KEY &&
          process.env.MAILJET_FROM_EMAIL
            ? (message, options) =>
                mailjetTransport(message, {
                  apiKey: process.env.MAILJET_API_KEY,
                  secretKey: process.env.MAILJET_SECRET_KEY,
                  fromEmail: process.env.MAILJET_FROM_EMAIL,
                  fromName: process.env.MAILJET_FROM_NAME || 'Venue',
                  signal: options?.signal,
                })
            : null,
      });
console.log('Venue API is ready.');
