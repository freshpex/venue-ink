import { parse, id, HttpError } from '../validation.mjs';
import { transaction } from '../db.mjs';
import { audit } from '../domain.mjs';
import { presetMenuInput, starterServices } from '../service-presets.mjs';

export function servicePresetRoutes(app, { pool }) {
  async function artist(db, artistId, lock = false) {
    const row = (
      await db.query(
        "SELECT a.user_id AS id,a.display_name,a.studio_id,st.name AS studio_name FROM venue_app.artist_profiles a JOIN venue_app.users u ON u.id=a.user_id JOIN venue_app.studios st ON st.id=a.studio_id WHERE a.user_id=$1 AND a.deleted_at IS NULL AND u.active=true AND u.role IN ('artist','admin')" +
          (lock ? ' FOR UPDATE OF a,u' : ''),
        [artistId],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, 'An active artist with a studio is required.');
    return row;
  }
  app.get('/api/admin/artists/:id/service-presets', async (req, res) => {
    const target = await artist(pool, parse(id, req.params.id));
    const saved = (
      await pool.query('SELECT services FROM venue_app.studio_service_presets WHERE studio_id=$1', [
        target.studio_id,
      ])
    ).rows[0];
    const existing = (
      await pool.query('SELECT name,preset_key FROM venue_app.services WHERE artist_id=$1', [
        target.id,
      ])
    ).rows;
    res.json({
      artist: target,
      presets: saved?.services || starterServices,
      source: saved ? 'studio' : 'starter',
      currency: 'USD',
      existing,
    });
  });
  app.put('/api/admin/artists/:id/service-presets', async (req, res) => {
    const artistId = parse(id, req.params.id),
      menu = parse(presetMenuInput, req.body);
    await transaction(pool, async (db) => {
      const target = await artist(db, artistId, true);
      await db.query(
        'INSERT INTO venue_app.studio_service_presets(studio_id,services,updated_by) VALUES($1,$2,$3) ON CONFLICT(studio_id) DO UPDATE SET services=excluded.services,updated_by=excluded.updated_by,updated_at=now()',
        [target.studio_id, JSON.stringify(menu.services), req.user.id],
      );
      await audit(db, req.user, 'studio.service_presets.updated', target.studio_id, {
        count: menu.services.length,
      });
    });
    res.json({ ok: true });
  });
  app.post('/api/admin/artists/:id/service-presets', async (req, res) => {
    const artistId = parse(id, req.params.id),
      menu = parse(presetMenuInput, req.body);
    const result = await transaction(pool, async (db) => {
      const target = await artist(db, artistId, true);
      const existing = (
        await db.query('SELECT name,preset_key FROM venue_app.services WHERE artist_id=$1', [
          target.id,
        ])
      ).rows;
      const names = new Set(existing.map((s) => s.name.trim().toLowerCase())),
        keys = new Set(existing.map((s) => s.preset_key));
      const skipped = menu.services
        .filter((s) => keys.has(s.key) || names.has(s.name.trim().toLowerCase()))
        .map((s) => s.name);
      const fresh = menu.services.filter(
        (s) => !keys.has(s.key) && !names.has(s.name.trim().toLowerCase()),
      );
      const created = fresh.length
        ? (
            await db.query(
              `INSERT INTO venue_app.services(id,studio_id,artist_id,name,description,category,duration_minutes,price_cents,deposit_cents,active,preset_key)
        SELECT gen_random_uuid(),$1,$2,s.name,s.description,s.category,s."durationMinutes",s."priceCents",s."depositCents",s.active,s.key
        FROM jsonb_to_recordset($3::jsonb) AS s(key text,name text,description text,category text,"durationMinutes" int,"priceCents" int,"depositCents" int,active boolean)
        RETURNING id,name,preset_key`,
              [target.studio_id, target.id, JSON.stringify(fresh)],
            )
          ).rows
        : [];
      await audit(db, req.user, 'artist.services.prefilled', artistId, {
        created: created.length,
        skipped: skipped.length,
      });
      return { created, skipped };
    });
    res.status(result.created.length ? 201 : 200).json(result);
  });
}
