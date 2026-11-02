import { createPool, transaction } from '../server/db.mjs';
const pool = createPool();
try {
  const count = await transaction(pool, async (db) => {
    const ids = (
      await db.query(
        "SELECT id FROM venue_app.users WHERE (email LIKE 'qa-%@venue.test' AND name LIKE 'QA %') OR (email ~ '^invited-[0-9a-f-]{36}@venue[.]test$' AND name='Invited Artist')",
      )
    ).rows.map((r) => r.id);
    if (!ids.length) return 0;
    const bookings = (
      await db.query(
        'SELECT id FROM venue_app.bookings WHERE client_id=ANY($1::uuid[]) OR artist_id=ANY($1::uuid[])',
        [ids],
      )
    ).rows.map((r) => r.id);
    const refs = (
      await db.query(
        'SELECT reference FROM venue_app.support_requests WHERE user_id=ANY($1::uuid[])',
        [ids],
      )
    ).rows.map((r) => r.reference);
    await db.query(
      "DELETE FROM venue_app.notifications WHERE user_id=ANY($1::uuid[]) OR booking_id=ANY($2::uuid[]) OR split_part(body,':',1)=ANY($3::text[])",
      [ids, bookings, refs],
    );
    await db.query('DELETE FROM venue_app.payment_requests WHERE booking_id=ANY($1::uuid[])', [
      bookings,
    ]);
    await db.query('DELETE FROM venue_app.bookings WHERE id=ANY($1::uuid[])', [bookings]);
    await db.query(
      'DELETE FROM venue_app.saved_designs WHERE user_id=ANY($1::uuid[]) OR design_id IN(SELECT id FROM venue_app.flash_designs WHERE artist_id=ANY($1::uuid[]))',
      [ids],
    );
    for (const table of ['ideas', 'support_requests'])
      await db.query('DELETE FROM venue_app.' + table + ' WHERE user_id=ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM venue_app.events WHERE artist_id=ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM venue_app.flash_designs WHERE artist_id=ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM venue_app.assets WHERE owner_id=ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM venue_app.availability WHERE artist_id=ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM venue_app.artist_profiles WHERE user_id=ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM venue_app.invitations WHERE created_by=ANY($1::uuid[])', [ids]);
    await db.query(
      'DELETE FROM venue_app.services WHERE studio_id IN(SELECT id FROM venue_app.studios WHERE owner_id=ANY($1::uuid[]))',
      [ids],
    );
    await db.query('DELETE FROM venue_app.studios WHERE owner_id=ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM venue_app.audit_logs WHERE actor_id=ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM venue_app.users WHERE id=ANY($1::uuid[])', [ids]);
    return ids.length;
  });
  console.log(JSON.stringify({ removedQaAccounts: count, scope: 'venue_app test fixtures only' }));
} finally {
  await pool.end();
}
