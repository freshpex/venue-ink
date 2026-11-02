import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve,sep } from 'node:path';
import { createPool, migrateDatabase } from './db.mjs';
import { seedDatabase } from './seed.mjs';
import { createApp } from './app.mjs';
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
const migrationPool = createPool(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, {
  direct: true,
});
let ready = false;
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    await migrateDatabase(migrationPool);
    await seedDatabase(migrationPool);
    ready = true;
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
const pool = createPool();
const app = createApp({ pool, secret: process.env.JWT_SECRET, origins, production });
const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));
const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (production && existsSync(`${dist}/index.html`)) {
  app.get(/^(?!\/api(?:\/|$)).*/, (req,res,next)=>{if(/^\/(admin|dashboard|bookings|workspace|login|register)(\/|$)/.test(req.path)){res.set('Cache-Control','no-store');res.set('X-Robots-Tag','noindex,nofollow');return next();}const path=resolve(dist,'.'+decodeURIComponent(req.path),'index.html');if(path.startsWith(resolve(dist)+sep)&&existsSync(path))return res.sendFile(path);next();});
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => res.sendFile(`${dist}/index.html`));
} else app.use('/images', express.static(`${publicDirectory}/images`, { maxAge: '1h' }));
const server = app.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () =>
  console.log('Venue API is ready.'),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
