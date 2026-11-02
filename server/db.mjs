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
    keepAlive: true,
    maxLifetimeSeconds: 300,
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
  // Only database work belongs in operation. A transaction may be replayed after
  // a dropped connection before COMMIT; an ambiguous COMMIT is never replayed.
  for(let attempt=0;attempt<2;attempt++){
    let client,commitAttempted=false,discard=false;
    try{
      client=await pool.connect();
      await client.query('BEGIN');
      const result=await operation(client);
      commitAttempted=true;
      await client.query('COMMIT');
      return result;
    }catch(error){
      const transient=['ECONNRESET','EPIPE','08000','08003','08006','57P01','57P02','57P03','40001','40P01'].includes(error.code)||/^Connection (terminated|closed|ended)/i.test(error.message||'');
      discard=transient;
      if(client){try{await client.query('ROLLBACK');}catch{discard=true;}}
      if(commitAttempted||!transient||attempt===1)throw error;
    }finally{
      client?.release(discard?new Error('Discarding interrupted database session'):undefined);
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
}
