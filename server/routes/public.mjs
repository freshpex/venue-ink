import { readAsset } from '../asset-storage.mjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parse, id, email, HttpError } from '../validation.mjs';
import { getSlots, notify } from '../domain.mjs';
import { paymentMethods } from '../content.mjs';
export function publicRoutes(app, { pool, writeLimiter }) {
  app.get('/api/site', async (_req, res) => {
    const settings = (
      await pool.query(
        'SELECT brand_name,payment_email,currency,timezone,booking_notice FROM venue_app.settings WHERE id=$1',
        ['site'],
      )
    ).rows[0];
    res.json({ settings, paymentMethods });
  });
  app.get('/api/artists', async (_req, res) => {
    const artists = (
      await pool.query(
        'SELECT a.user_id AS id,a.slug,a.display_name,a.bio,a.styles,a.theme,a.image_url,a.books_open,a.studio_id,st.image_url AS studio_image_url,st.name AS studio_name,st.timezone FROM venue_app.artist_profiles a JOIN venue_app.users u ON u.id=a.user_id AND u.active=true LEFT JOIN venue_app.studios st ON st.id=a.studio_id WHERE a.published=true AND st.published=true ORDER BY a.created_at LIMIT 100',
      )
    ).rows;
    res.json({ artists });
  });
  app.get('/api/artists/:slug', async (req, res) => {
    const artist = (
      await pool.query(
        'SELECT a.user_id AS id,a.slug,a.display_name,a.bio,a.styles,a.theme,a.image_url,a.books_open,a.studio_id,st.image_url AS studio_image_url,st.name AS studio_name,st.timezone FROM venue_app.artist_profiles a JOIN venue_app.users u ON u.id=a.user_id AND u.active=true LEFT JOIN venue_app.studios st ON st.id=a.studio_id WHERE a.slug=$1 AND a.published=true AND st.published=true',
        [req.params.slug],
      )
    ).rows[0];
    if (!artist) throw new HttpError(404, 'Artist not found.');
    const services = (
      await pool.query(
        'SELECT id,artist_id,name,description,category,duration_minutes,price_cents,deposit_cents,currency FROM venue_app.services WHERE active=true AND studio_id=$1 AND (artist_id IS NULL OR artist_id=$2) ORDER BY created_at',
        [artist.studio_id, artist.id],
      )
    ).rows;
    res.json({ artist, services });
  });
  app.get('/api/studios', async (_req, res) =>
    res.json({
      studios: (
        await pool.query(
          'SELECT id,name,slug,bio,location,timezone,image_url FROM venue_app.studios WHERE published=true ORDER BY created_at LIMIT 100',
        )
      ).rows,
    }),
  );
  app.get('/api/studios/:slug', async (req, res) => {
    const studio = (
      await pool.query(
        'SELECT id,name,slug,bio,location,timezone,image_url FROM venue_app.studios WHERE slug=$1 AND published=true',
        [req.params.slug],
      )
    ).rows[0];
    if (!studio) throw new HttpError(404, 'Studio not found.');
    const artists = (
      await pool.query(
        'SELECT user_id AS id,slug,display_name,bio,styles,theme,image_url,books_open FROM venue_app.artist_profiles WHERE studio_id=$1 AND published=true',
        [studio.id],
      )
    ).rows;
    res.json({ studio, artists });
  });
  app.get('/api/services', async (req, res) => {
    const params = [];
    let condition =
      "s.active=true AND st.published=true AND (s.artist_id IS NULL OR (a.published=true AND a.deleted_at IS NULL AND u.active=true AND u.role IN ('artist','admin')))";
    if (req.query.studioId) {
      params.push(parse(id, req.query.studioId));
      condition += ' AND s.studio_id=$1';
    }
    if (req.query.artistId) {
      params.push(parse(id, req.query.artistId));
      condition += ` AND (s.artist_id IS NULL OR s.artist_id=$${params.length}) AND s.studio_id=(SELECT studio_id FROM venue_app.artist_profiles WHERE user_id=$${params.length} AND deleted_at IS NULL)`;
    }
    res.json({
      services: (
        await pool.query(
          `SELECT s.id,s.studio_id,s.artist_id,s.name,s.description,s.category,s.duration_minutes,s.price_cents,s.deposit_cents,s.currency,st.name AS studio_name,a.display_name AS artist_name FROM venue_app.services s JOIN venue_app.studios st ON st.id=s.studio_id LEFT JOIN venue_app.artist_profiles a ON a.user_id=s.artist_id LEFT JOIN venue_app.users u ON u.id=a.user_id WHERE ${condition} ORDER BY s.created_at`,
          params,
        )
      ).rows,
    });
  });
  app.get('/api/availability', async (req, res) => {
    const input = parse(
      z.object({ artistId: id, serviceId: id, date: z.string(), eventId: id.optional() }),
      req.query,
    );
    res.json(await getSlots(pool, input));
  });
  app.get('/api/flash', async (req, res) => {
    const params = [];
    let where =
      'f.published=true AND f.archived=false AND a.published=true AND st.published=true AND u.active=true';
    if (req.query.artistId) {
      params.push(parse(id, req.query.artistId));
      where += ` AND f.artist_id=$${params.length}`;
    }
    const designs = (
      await pool.query(
        `SELECT f.id,f.artist_id,f.title,f.description,f.category,f.price_cents,f.size_note,f.placement_note,f.repeatable,f.created_at,'/api/assets/'||f.asset_id::text AS image_url,a.display_name AS artist_name,a.slug AS artist_slug,st.name AS studio_name FROM venue_app.flash_designs f JOIN venue_app.artist_profiles a ON a.user_id=f.artist_id JOIN venue_app.users u ON u.id=a.user_id LEFT JOIN venue_app.studios st ON st.id=a.studio_id WHERE ${where} AND (f.repeatable=true OR NOT EXISTS(SELECT 1 FROM venue_app.bookings b WHERE b.flash_id=f.id AND b.status IN ('confirmed','completed'))) ORDER BY f.created_at DESC LIMIT 200`,
        params,
      )
    ).rows;
    res.json({ designs });
  });
  app.get('/api/articles', async (_req, res) =>
    res.json({
      articles: (
        await pool.query(
          'SELECT id,slug,title,category,excerpt,image_name,author_name,published_at FROM venue_app.articles WHERE published=true ORDER BY published_at DESC LIMIT 100',
        )
      ).rows,
    }),
  );
  app.get('/api/articles/:slug', async (req, res) => {
    const article = (
      await pool.query(
        'SELECT id,slug,title,category,excerpt,body,image_name,author_name,published_at FROM venue_app.articles WHERE slug=$1 AND published=true',
        [req.params.slug],
      )
    ).rows[0];
    if (!article) throw new HttpError(404, 'Article not found.');
    res.json({ article });
  });
  app.get('/api/events', async (_req, res) =>
    res.json({
      events: (
        await pool.query(
          "SELECT e.id,e.title,e.description,e.location,e.starts_at,e.ends_at,e.capacity,e.artist_id,e.service_id,e.studio_id,a.display_name AS artist_name,st.name AS studio_name,st.timezone,(SELECT count(*)::integer FROM venue_app.bookings b WHERE b.event_id=e.id AND b.status IN ('confirmed','completed')) AS reserved FROM venue_app.events e JOIN venue_app.artist_profiles a ON a.user_id=e.artist_id JOIN venue_app.studios st ON st.id=e.studio_id WHERE e.published=true AND a.published=true AND a.books_open=true AND st.published=true AND EXISTS(SELECT 1 FROM venue_app.users u WHERE u.id=a.user_id AND u.active=true) AND EXISTS(SELECT 1 FROM venue_app.services s WHERE s.id=e.service_id AND s.active=true) AND e.ends_at>now() ORDER BY e.starts_at LIMIT 100",
        )
      ).rows,
    }),
  );
  app.get('/api/assets/:id', async (req, res) => {
    const assetId = parse(id, req.params.id);
    const asset = (
      await pool.query(
        'SELECT id,owner_id,mime_type,public,bucket,storage_provider,storage_key,byte_size FROM venue_app.assets WHERE id=$1',
        [assetId],
      )
    ).rows[0];
    if (!asset) throw new HttpError(404, 'Image not found.');
    let permitted = asset.public;
    if (!permitted && req.user) {
      permitted = req.user.role === 'admin' || asset.owner_id === req.user.id;
      if (!permitted) {
        permitted =
          (
            await pool.query(
              "SELECT 1 FROM venue_app.booking_assets ba JOIN venue_app.bookings b ON b.id=ba.booking_id JOIN venue_app.artist_profiles a ON a.user_id=b.artist_id LEFT JOIN venue_app.studios st ON st.id=a.studio_id WHERE ba.asset_id=$1 AND (b.client_id=$2 OR ($3=true AND (b.artist_id=$2 OR st.owner_id=$2 OR EXISTS(SELECT 1 FROM venue_app.studio_access sa WHERE sa.studio_id=st.id AND sa.user_id=$2 AND sa.access_role IN ('manager','receptionist')))))",
              [assetId, req.user.id, req.user.role !== 'client'],
            )
          ).rowCount > 0;
      }
    }
    if (!permitted) throw new HttpError(404, 'Image not found.');
    const bytes = await readAsset(pool, app.locals.profileStorage, asset);
    res.set('Content-Type', asset.mime_type);
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cache-Control', asset.public ? 'public,max-age=3600' : 'private,no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(bytes);
  });
  app.post('/api/contact', writeLimiter, async (req, res) => {
    const input = parse(
      z
        .object({
          name: z.string().trim().min(2).max(100),
          email,
          category: z.string().min(2).max(60),
          studioName: z.string().max(150).default(''),
          message: z.string().trim().min(15).max(3000),
        })
        .strict(),
      req.body,
    );
    const reference = `SUP-${randomUUID().slice(0, 8).toUpperCase()}`;
    const record = (
      await pool.query(
        'INSERT INTO venue_app.support_requests(id,reference,user_id,name,email,category,studio_name,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,reference,status',
        [
          randomUUID(),
          reference,
          req.user?.id || null,
          req.user?.name || input.name,
          req.user?.email || input.email,
          input.category,
          input.studioName,
          input.message,
        ],
      )
    ).rows[0];
    const admins = (
      await pool.query("SELECT id FROM venue_app.users WHERE role='admin' AND active=true")
    ).rows;
    for (const admin of admins)
      await notify(pool, admin.id, 'New support enquiry', `${reference}: ${input.category}`);
    res.status(201).json({ request: record });
  });
}
