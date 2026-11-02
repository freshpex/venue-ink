import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
export function connectionConfig(value = process.env.DATABASE_URL, { direct = false } = {}) {
  if (!value) throw new Error('DATABASE_URL is required');
  const url = new URL(value);
  if (direct && url.hostname.endsWith('.neon.tech'))
    url.hostname = url.hostname.replace('-pooler.', '.');
  if (url.searchParams.get('sslmode') === 'require') url.searchParams.set('sslmode', 'verify-full');
  return {
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    statement_timeout: 20000,
  };
}
export function createPool(value, options) {
  const pool = new pg.Pool(connectionConfig(value, options));
  pool.on('error', (e) => console.error('Database connection interrupted:', e.code || e.name));
  return pool;
}
export async function migrateDatabase(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [7912055]);
    await migrate(drizzle(client), {
      migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)),
      migrationsSchema: 'venue_app',
      migrationsTable: 'schema_migrations',
    });
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [7912055]);
    client.release();
  }
}
export async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
