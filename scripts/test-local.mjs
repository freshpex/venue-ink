import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { createPool, migrateDatabase } from '../server/db.mjs';
import { seedDatabase } from '../server/seed.mjs';
import { s3Fixture } from '../tests/helpers/s3.mjs';

const directory = await mkdtemp(join(tmpdir(), 'venue-tests-'));
const socket = createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const dbPassword = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: join(directory, 'db'),
  user: 'venue_test',
  password: dbPassword,
  port,
  persistent: false,
  postgresFlags: ['-h', '127.0.0.1', '-k', directory],
  onLog: () => {},
  onError: () => {},
});
let child, objectStorage;
const stop = () => child?.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  await postgres.initialise();
  await postgres.start();
  const databaseUrl = 'postgresql://venue_test:' + dbPassword + '@127.0.0.1:' + port + '/postgres';
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_UNPOOLED: databaseUrl,
    JWT_SECRET: randomBytes(32).toString('hex'),
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    SEED_ADMIN_EMAIL: 'admin@venue.com',
    SEED_ADMIN_PASSWORD: randomBytes(24).toString('hex'),
    REQUIRE_STAFF_MFA: 'false',
    AWS_ENDPOINT_URL_S3: '',
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: '',
    MAILJET_API_KEY: '',
    MAILJET_SECRET_KEY: '',
    MAILJET_FROM_EMAIL: '',
    OIDC_ISSUER: '',
    OIDC_CLIENT_ID: '',
    OIDC_CLIENT_SECRET: '',
    NODE_ENV: 'test',
    VENUE_ISOLATED_TESTS: 'true',
    SITE_URL: 'http://127.0.0.1:4173',
    CLIENT_ORIGINS: 'http://127.0.0.1:4173,http://127.0.0.1:5173',
  };
  const pool = createPool(databaseUrl);
  try {
    await migrateDatabase(pool);
    await seedDatabase(pool, { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
  } finally {
    await pool.end();
  }
  console.log('Temporary PostgreSQL initialized. No configured database is used.');
  const args = process.argv.slice(2);
  if (args.includes('--s3')) {
    args.splice(args.indexOf('--s3'), 1);
    objectStorage = await s3Fixture();
    Object.assign(env, objectStorage.env);
  }
  const e2e = args[0] === '--e2e';
  if (e2e) args.shift();
  child = spawn(
    process.execPath,
    [
      e2e ? 'node_modules/@playwright/test/cli.js' : 'node_modules/vitest/vitest.mjs',
      e2e ? 'test' : 'run',
      ...args,
    ],
    { env, stdio: 'inherit' },
  );
  process.exitCode = await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
} catch (error) {
  console.error(
    'Local test environment failed:',
    error.code || error.name,
    error.message?.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]'),
  );
  process.exitCode = 1;
} finally {
  await objectStorage?.close();
  await postgres.stop().catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
