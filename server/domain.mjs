import { randomUUID } from 'node:crypto';
import { HttpError } from './validation.mjs';
export const userFields = 'id,email,name,role,created_at,image_url';
export const isStaff = (user) => ['admin', 'studio', 'artist'].includes(user.role);
export const bookingFields = `b.id,b.reference,b.client_id,b.artist_id,b.service_id,b.flash_id,b.event_id,b.title,b.notes,b.placement,b.size_note,b.starts_at,b.ends_at,b.status,b.quote_cents,b.deposit_cents,b.currency,b.cancellation_note,b.created_at,b.updated_at,s.name AS service_name,s.duration_minutes,a.display_name AS artist_name,a.slug AS artist_slug,st.id AS studio_id,st.name AS studio_name,st.timezone,u.name AS client_name,u.email AS client_email,(SELECT COALESCE(sum(p.amount_cents),0)::integer FROM venue_app.payment_requests p WHERE p.booking_id=b.id AND p.status='received') - (SELECT COALESCE(sum(r.amount_cents),0)::integer FROM venue_app.refunds r JOIN venue_app.payment_requests rp ON rp.id=r.payment_id WHERE rp.booking_id=b.id AND r.status='succeeded') AS paid_cents`;
export const bookingJoins =
  'FROM venue_app.bookings b JOIN venue_app.services s ON s.id=b.service_id JOIN venue_app.artist_profiles a ON a.user_id=b.artist_id LEFT JOIN venue_app.studios st ON st.id=a.studio_id JOIN venue_app.users u ON u.id=b.client_id';
export function bookingScope(user, start = 1, permission = 'bookings') {
  const access = permission === 'payments' ? "'manager','finance'" : "'manager','receptionist'";
  if (user.role === 'admin') return { clause: 'true', params: [] };
  if (user.role === 'client') return { clause: `b.client_id=$${start}`, params: [user.id] };
  return {
    clause: `(b.client_id=$${start} OR b.artist_id=$${start} OR st.owner_id=$${start} OR EXISTS(SELECT 1 FROM venue_app.studio_access sa WHERE sa.studio_id=st.id AND sa.user_id=$${start} AND sa.access_role IN (${access})))`,
    params: [user.id],
  };
}
export async function getBooking(
  db,
  bookingId,
  user,
  { lock = false, manage = false, permission = 'bookings' } = {},
) {
  if (lock) await db.query('SELECT id FROM venue_app.bookings WHERE id=$1 FOR UPDATE', [bookingId]);
  const result = await db.query(
    `SELECT ${bookingFields},st.owner_id AS studio_owner ${bookingJoins} WHERE b.id=$1`,
    [bookingId],
  );
  const row = result.rows[0];
  if (
    !row ||
    !(
      user.role === 'admin' ||
      (isStaff(user) && row.artist_id === user.id) ||
      (isStaff(user) && row.studio_owner === user.id) ||
      (!manage && row.client_id === user.id) ||
      (isStaff(user) && (await canManageStudio(db, row.studio_id, user, permission)))
    )
  )
    throw new HttpError(404, 'Booking not found.');
  return row;
}
export async function canManageStudio(db, studioId, user, permission = 'manage') {
  const roles =
    permission === 'payments'
      ? ['manager', 'finance']
      : permission === 'bookings'
        ? ['manager', 'receptionist']
        : ['manager'];
  if (user.role === 'admin') return true;
  return (
    (
      await db.query(
        'SELECT 1 FROM venue_app.studios st WHERE st.id=$1 AND (st.owner_id=$2 OR EXISTS(SELECT 1 FROM venue_app.studio_access sa WHERE sa.studio_id=st.id AND sa.user_id=$2 AND sa.access_role=ANY($3::text[])))',
        [studioId, user.id, roles],
      )
    ).rowCount > 0
  );
}
export async function notify(db, userId, title, body = '', bookingId = null) {
  await db.query(
    'INSERT INTO venue_app.notifications(id,user_id,title,body,booking_id) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), userId, title, body, bookingId],
  );
}
export async function audit(db, user, action, entityId, details = {}) {
  await db.query(
    'INSERT INTO venue_app.audit_logs(id,actor_id,action,entity_id,details) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), user?.id || null, action, entityId, JSON.stringify(details)],
  );
}
export async function getSlots(db, { artistId, serviceId, date, eventId }) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    +new Date(date) > Date.now() + 366 * 86400000
  )
    throw new HttpError(400, 'Choose a valid date.');
  const profile = (
    await db.query(
      'SELECT a.user_id,a.studio_id,a.published,a.books_open,st.timezone,st.published AS studio_published FROM venue_app.artist_profiles a LEFT JOIN venue_app.studios st ON st.id=a.studio_id JOIN venue_app.users u ON u.id=a.user_id AND u.active=true WHERE a.user_id=$1',
      [artistId],
    )
  ).rows[0];
  if (!profile || !profile.published || !profile.books_open || !profile.studio_published)
    return { slots: [], timezone: profile?.timezone || 'UTC' };
  const service = (
    await db.query(
      'SELECT id,duration_minutes,studio_id,artist_id FROM venue_app.services WHERE id=$1 AND active=true',
      [serviceId],
    )
  ).rows[0];
  if (
    !service ||
    service.studio_id !== profile.studio_id ||
    (service.artist_id && service.artist_id !== artistId)
  )
    throw new HttpError(400, 'This service is not offered by the selected artist.');
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const hours = (
    await db.query(
      'SELECT start_time,end_time FROM venue_app.availability WHERE artist_id=$1 AND weekday=$2',
      [artistId, weekday],
    )
  ).rows[0];
  if (!hours) return { slots: [], timezone: profile.timezone || 'UTC' };
  const bounds = (
    await db.query(
      'SELECT (($1::date+$2::time) AT TIME ZONE $4) AS opening,(($1::date+$3::time) AT TIME ZONE $4) AS closing',
      [date, hours.start_time, hours.end_time, profile.timezone || 'UTC'],
    )
  ).rows[0];
  let event;
  if (eventId) {
    event = (
      await db.query('SELECT * FROM venue_app.events WHERE id=$1 AND published=true', [eventId])
    ).rows[0];
    if (!event || event.artist_id !== artistId || event.service_id !== serviceId)
      throw new HttpError(400, 'This event is not available for that artist and service.');
    const count = Number(
      (
        await db.query(
          "SELECT count(*) FROM venue_app.bookings WHERE event_id=$1 AND status IN ('confirmed','completed')",
          [eventId],
        )
      ).rows[0].count,
    );
    if (count >= event.capacity) return { slots: [], timezone: profile.timezone || 'UTC' };
  }
  const occupied = (
    await db.query(
      "SELECT starts_at,ends_at FROM venue_app.bookings WHERE artist_id=$1 AND status IN ('confirmed','completed') AND starts_at < $3 AND ends_at > $2",
      [artistId, bounds.opening, bounds.closing],
    )
  ).rows;
  const slots = [];
  const duration = service.duration_minutes * 60000;
  for (
    let start = +new Date(bounds.opening);
    start + duration <= +new Date(bounds.closing);
    start += 30 * 60000
  ) {
    const end = start + duration;
    if (start <= Date.now() + 15 * 60000) continue;
    if (event && (start < +new Date(event.starts_at) || end > +new Date(event.ends_at))) continue;
    if (occupied.some((b) => start < +new Date(b.ends_at) && end > +new Date(b.starts_at)))
      continue;
    slots.push({
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      label: new Intl.DateTimeFormat('en-GB', {
        timeZone: profile.timezone || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
      }).format(start),
    });
  }
  return { slots, timezone: profile.timezone || 'UTC' };
}
export async function ensureNoConflict(db, { artistId, startsAt, endsAt, excludeId = null }) {
  await db.query('SELECT user_id FROM venue_app.artist_profiles WHERE user_id=$1 FOR UPDATE', [
    artistId,
  ]);
  const conflict = await db.query(
    "SELECT id FROM venue_app.bookings WHERE artist_id=$1 AND status IN ('confirmed','completed') AND starts_at < $3 AND ends_at > $2 AND ($4::uuid IS NULL OR id<>$4)",
    [artistId, startsAt, endsAt, excludeId],
  );
  if (conflict.rowCount)
    throw new HttpError(
      409,
      'That appointment overlaps another confirmed booking. Please choose another time.',
    );
}
