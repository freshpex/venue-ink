import { createPool, migrateDatabase } from '../server/db.mjs';
import { seedDatabase } from '../server/seed.mjs';
const pool = createPool(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, {
  direct: true,
});
try {
  await migrateDatabase(pool);
  const result = await seedDatabase(pool);
  console.log(JSON.stringify({ schema: 'venue_app', migrated: true, seeded: true, ...result }));
} catch (error) {
  console.error(
    'Database setup failed:',
    error.code || error.name,
    error.message?.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]'),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
