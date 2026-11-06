import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parse, id, HttpError } from '../validation.mjs';
import { transaction } from '../db.mjs';
import { audit, canManageStudio, bookingJoins, isStaff } from '../domain.mjs';

export function artistManagementRoutes(app, { pool }) {
  app.get('/api/admin/artists/:id/setup', async (req, res) => {
    const artistId = parse(id, req.params.id);
    const profile = (
      await pool.query(
        'SELECT user_id AS id,studio_id,display_name,bio,styles,theme,image_url,published,books_open,slug FROM venue_app.artist_profiles WHERE user_id=$1 AND deleted_at IS NULL',
        [artistId],
      )
    ).rows[0];
    if (!profile) throw new HttpError(404, 'Artist not found.');
    const availability = (
      await pool.query(
        'SELECT weekday,start_time,end_time FROM venue_app.availability WHERE artist_id=$1 ORDER BY weekday',
        [artistId],
      )
    ).rows;
    res.json({ profile, availability });
  });
  app.put('/api/admin/artists/:id/availability', async (req, res) => {
    const artistId = parse(id, req.params.id);
    const v = parse(
      z
        .object({
          hours: z
            .array(
              z
                .object({
                  weekday: z.number().int().min(0).max(6),
                  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
                  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
                })
                .strict()
                .refine((h) => h.endTime > h.startTime, 'Closing time must follow opening time.'),
            )
            .max(7)
            .refine(
              (hours) => new Set(hours.map((h) => h.weekday)).size === hours.length,
              'Each weekday can be listed once.',
            ),
        })
        .strict(),
      req.body,
    );
    await transaction(pool, async (db) => {
      if (
        !(
          await db.query(
            'SELECT user_id FROM venue_app.artist_profiles WHERE user_id=$1 AND deleted_at IS NULL FOR UPDATE',
            [artistId],
          )
        ).rowCount
      )
        throw new HttpError(404, 'Artist not found.');
      await db.query('DELETE FROM venue_app.availability WHERE artist_id=$1', [artistId]);
      for (const h of v.hours)
        await db.query(
          'INSERT INTO venue_app.availability(id,artist_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5)',
          [randomUUID(), artistId, h.weekday, h.startTime, h.endTime],
        );
      await audit(db, req.user, 'artist.availability.updated', artistId);
    });
    res.json({ ok: true });
  });
  app.delete('/api/admin/artists/:id', async (req, res) => {
    const artistId = parse(id, req.params.id);
    if (artistId === req.user.id)
      throw new HttpError(400, 'You cannot delete your own artist profile here.');
    await transaction(pool, async (db) => {
      const user = (
        await db.query('SELECT role FROM venue_app.users WHERE id=$1 FOR UPDATE', [artistId])
      ).rows[0];
      if (!user || user.role !== 'artist') throw new HttpError(404, 'Artist not found.');
      if (
        (
          await db.query(
            "SELECT 1 FROM venue_app.bookings WHERE artist_id=$1 AND status IN ('pending','confirmed') AND ends_at>now() LIMIT 1",
            [artistId],
          )
        ).rowCount
      )
        throw new HttpError(
          409,
          'Resolve this artist’s upcoming booking requests before deleting their profile.',
        );
      const result = await db.query(
        'UPDATE venue_app.artist_profiles SET deleted_at=now(),published=false,books_open=false WHERE user_id=$1 AND deleted_at IS NULL RETURNING user_id',
        [artistId],
      );
      if (!result.rowCount) throw new HttpError(404, 'Artist not found.');
      await db.query(
        'UPDATE venue_app.users SET active=false,session_version=session_version+1,updated_at=now() WHERE id=$1',
        [artistId],
      );
      await db.query(
        'UPDATE venue_app.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [artistId],
      );
      await db.query('UPDATE venue_app.services SET active=false WHERE artist_id=$1', [artistId]);
      await db.query(
        'UPDATE venue_app.studios st SET published=false WHERE st.owner_id=$1 AND NOT EXISTS(SELECT 1 FROM venue_app.artist_profiles a JOIN venue_app.users u ON u.id=a.user_id WHERE a.studio_id=st.id AND a.deleted_at IS NULL AND u.active=true)',
        [artistId],
      );
      await db.query(
        "UPDATE venue_app.assets SET public=false WHERE owner_id=$1 AND bucket='profile'",
        [artistId],
      );
      await db.query('UPDATE venue_app.events SET published=false WHERE artist_id=$1', [artistId]);
      await db.query(
        'UPDATE venue_app.flash_designs SET published=false,archived=true WHERE artist_id=$1',
        [artistId],
      );
      await audit(db, req.user, 'artist.deleted', artistId);
    });
    res.json({ ok: true });
  });
  app.get('/api/workspace/clients', async (req, res) => {
    if (!isStaff(req.user)) throw new HttpError(403, 'An artist or studio account is required.');
    const scope =
      req.user.role === 'admin'
        ? { clause: 'true', params: [] }
        : {
            clause:
              "(b.artist_id=$1 OR st.owner_id=$1 OR EXISTS(SELECT 1 FROM venue_app.studio_access sa WHERE sa.studio_id=st.id AND sa.user_id=$1 AND sa.access_role IN ('manager','receptionist')))",
            params: [req.user.id],
          };
    const clients = (
      await pool.query(
        `SELECT u.id,u.name,u.email,u.image_url,count(*)::int AS bookings,max(b.starts_at) AS last_appointment ${bookingJoins} WHERE ${scope.clause} GROUP BY u.id,u.name,u.email,u.image_url ORDER BY max(b.starts_at) DESC LIMIT 200`,
        scope.params,
      )
    ).rows;
    res.json({ clients });
  });
  function photoTarget(kind, req) {
    return { kind, id: parse(id, req.params.id) };
  }
  async function authorizedTarget(db, target, user, lock = false) {
    if (target.kind === 'studio') {
      if (!isStaff(user)) throw new HttpError(404, 'Studio not found.');
      const row = (
        await db.query(
          'SELECT id,owner_id,image_url FROM venue_app.studios WHERE id=$1' +
            (lock ? ' FOR UPDATE' : ''),
          [target.id],
        )
      ).rows[0];
      if (!row || !(await canManageStudio(db, target.id, user)))
        throw new HttpError(404, 'Studio not found.');
      return { ownerId: row.owner_id, previous: row.image_url };
    }
    if (user.role !== 'admin' && target.id !== user.id)
      throw new HttpError(403, 'You cannot change this account’s photograph.');
    const row = (
      await db.query(
        'SELECT u.id,COALESCE(u.image_url,(SELECT a.image_url FROM venue_app.artist_profiles a WHERE a.user_id=u.id)) AS image_url FROM venue_app.users u WHERE id=$1' +
          (lock ? ' FOR UPDATE' : ''),
        [target.id],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, 'Account not found.');
    return { ownerId: row.id, previous: row.image_url };
  }
  async function unpublishUnused(db, previous) {
    if (!previous) return;
    await db.query(
      "UPDATE venue_app.assets SET public=false WHERE $1='/api/assets/'||id::text AND NOT EXISTS(SELECT 1 FROM venue_app.artist_profiles WHERE image_url=$1) AND NOT EXISTS(SELECT 1 FROM venue_app.users WHERE image_url=$1) AND NOT EXISTS(SELECT 1 FROM venue_app.studios WHERE image_url=$1) AND NOT EXISTS(SELECT 1 FROM venue_app.flash_designs WHERE asset_id=venue_app.assets.id AND published=true)",
      [previous],
    );
  }
  const upload = (kind) => async (req, res) => {
    const target = photoTarget(kind, req);
    const permission = await authorizedTarget(pool, target, req.user);
    const v = parse(
      z
        .object({
          filename: z.string().max(150),
          mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
          data: z.string().max(2800000),
        })
        .strict(),
      req.body,
    );
    const bytes = Buffer.from(v.data, 'base64');
    const valid =
      (v.mimeType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
      (v.mimeType === 'image/png' &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (v.mimeType === 'image/webp' &&
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP');
    if (!valid || !bytes.length || bytes.length > 2097152)
      throw new HttpError(400, 'Choose a valid JPEG, PNG or WebP image smaller than 2 MB.');
    const assetId = randomUUID(),
      url = '/api/assets/' + assetId,
      storage = app.locals.profileStorage;
    await transaction(pool, async (db) => {
      const current = await authorizedTarget(db, target, req.user, true);
      await db.query('SELECT id FROM venue_app.users WHERE id=$1 FOR UPDATE', [permission.ownerId]);
      const usage = Number(
        (
          await db.query(
            'SELECT COALESCE(sum(byte_size),0) AS bytes FROM venue_app.assets WHERE owner_id=$1',
            [permission.ownerId],
          )
        ).rows[0].bytes,
      );
      if (usage + bytes.length > 40 * 1024 * 1024)
        throw new HttpError(
          409,
          'This account’s image storage is full. Remove unused images before uploading more.',
        );
      await db.query(
        'INSERT INTO venue_app.assets(id,owner_id,mime_type,filename,byte_size,data,public,bucket) VALUES($1,$2,$3,$4,$5,$6,true,$7)',
        [assetId, permission.ownerId, v.mimeType, v.filename, bytes.length, bytes, storage.bucket],
      );
      if (kind === 'studio')
        await db.query('UPDATE venue_app.studios SET image_url=$1 WHERE id=$2', [url, target.id]);
      else {
        await db.query('UPDATE venue_app.users SET image_url=$1,updated_at=now() WHERE id=$2', [
          url,
          target.id,
        ]);
        await db.query('UPDATE venue_app.artist_profiles SET image_url=$1 WHERE user_id=$2', [
          url,
          target.id,
        ]);
      }
      await unpublishUnused(db, current.previous);
      await audit(db, req.user, 'profile.photo.updated', target.id, { kind });
    });
    res.json({ imageUrl: url });
  };
  const remove = (kind) => async (req, res) => {
    const target = photoTarget(kind, req);
    await transaction(pool, async (db) => {
      const permission = await authorizedTarget(db, target, req.user, true);
      if (kind === 'studio')
        await db.query('UPDATE venue_app.studios SET image_url=NULL WHERE id=$1', [target.id]);
      else {
        await db.query('UPDATE venue_app.users SET image_url=NULL,updated_at=now() WHERE id=$1', [
          target.id,
        ]);
        await db.query('UPDATE venue_app.artist_profiles SET image_url=NULL WHERE user_id=$1', [
          target.id,
        ]);
      }
      await unpublishUnused(db, permission.previous);
      await audit(db, req.user, 'profile.photo.removed', target.id, { kind });
    });
    res.json({ ok: true });
  };
  app.put('/api/accounts/:id/photo', upload('account'));
  app.delete('/api/accounts/:id/photo', remove('account'));
  app.put('/api/studios/:id/photo', upload('studio'));
  app.delete('/api/studios/:id/photo', remove('studio'));
}
