import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parse, id, email, timezone, articleInput, HttpError } from '../validation.mjs';
import { transaction } from '../db.mjs';
import { audit, notify, canManageStudio, isStaff } from '../domain.mjs';
export function adminRoutes(app, { pool }) {
  const staff = (req, _res, next) =>
    isStaff(req.user)
      ? next()
      : next(new HttpError(403, 'An artist or studio account is required.'));
  app.get('/api/workspace/events', staff, async (req, res) =>
    res.json({
      events: (
        await pool.query(
          'SELECT e.id,e.studio_id,e.artist_id,e.service_id,e.title,e.description,e.location,e.starts_at,e.ends_at,e.capacity,e.published FROM venue_app.events e JOIN venue_app.studios st ON st.id=e.studio_id WHERE st.owner_id=$1 OR e.artist_id=$1 OR $2=true ORDER BY e.starts_at DESC LIMIT 100',
          [req.user.id, req.user.role === 'admin'],
        )
      ).rows,
    }),
  );
  const eventSchema = z
    .object({
      studioId: id,
      artistId: id,
      serviceId: id,
      title: z.string().trim().min(3).max(150),
      description: z.string().max(2000),
      location: z.string().max(200),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
      capacity: z.number().int().min(1).max(200),
      published: z.boolean(),
    })
    .strict()
    .refine(
      (v) => +new Date(v.endsAt) > +new Date(v.startsAt),
      'The event must end after it starts.',
    );
  const saveEvent = async (req, res) => {
    const v = parse(eventSchema, req.body);
    if (!(await canManageStudio(pool, v.studioId, req.user)))
      throw new HttpError(403, 'You cannot manage this studio.');
    const artist = (
      await pool.query(
        'SELECT 1 FROM venue_app.artist_profiles WHERE user_id=$1 AND studio_id=$2',
        [v.artistId, v.studioId],
      )
    ).rowCount;
    const service = (
      await pool.query(
        'SELECT 1 FROM venue_app.services WHERE id=$1 AND studio_id=$2 AND active=true',
        [v.serviceId, v.studioId],
      )
    ).rowCount;
    if (!artist || !service)
      throw new HttpError(400, 'Choose an artist and service from this studio.');
    const eventId = req.params.id ? parse(id, req.params.id) : randomUUID();
    if (req.params.id) {
      const existing = (
        await pool.query('SELECT studio_id FROM venue_app.events WHERE id=$1', [eventId])
      ).rows[0];
      if (!existing || existing.studio_id !== v.studioId)
        throw new HttpError(404, 'Event not found.');
    }
    await pool.query(
      'INSERT INTO venue_app.events(id,studio_id,artist_id,service_id,title,description,location,starts_at,ends_at,capacity,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET artist_id=excluded.artist_id,service_id=excluded.service_id,title=excluded.title,description=excluded.description,location=excluded.location,starts_at=excluded.starts_at,ends_at=excluded.ends_at,capacity=excluded.capacity,published=excluded.published',
      [
        eventId,
        v.studioId,
        v.artistId,
        v.serviceId,
        v.title,
        v.description,
        v.location,
        v.startsAt,
        v.endsAt,
        v.capacity,
        v.published,
      ],
    );
    res.status(req.params.id ? 200 : 201).json({ event: { id: eventId } });
  };
  app.post('/api/workspace/events', staff, saveEvent);
  app.put('/api/workspace/events/:id', staff, saveEvent);
  app.use('/api/admin', (req, _res, next) =>
    req.user.role === 'admin'
      ? next()
      : next(new HttpError(403, 'Administrator access is required.')),
  );
  app.get('/api/admin/overview', async (_req, res) => {
    const result = (
      await pool.query(
        "SELECT (SELECT count(*)::integer FROM venue_app.users) AS users,(SELECT count(*)::integer FROM venue_app.bookings) AS bookings,(SELECT count(*)::integer FROM venue_app.support_requests WHERE status<>'resolved') AS open_support,(SELECT COALESCE(sum(amount_cents),0)::integer FROM venue_app.payment_requests WHERE status='received') AS received_cents,(SELECT count(*)::integer FROM venue_app.payment_requests WHERE status='requested') AS payment_requests",
      )
    ).rows[0];
    res.json({ overview: result });
  });
  app.get('/api/admin/users', async (req, res) => {
    const search = String(req.query.search || '').slice(0, 100);
    res.json({
      users: (
        await pool.query(
          'SELECT id,name,email,role,active,created_at FROM venue_app.users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT 200',
          [`%${search}%`],
        )
      ).rows,
    });
  });
  app.patch('/api/admin/users/:id', async (req, res) => {
    const userId = parse(id, req.params.id);
    const v = parse(
      z
        .object({
          role: z.enum(['admin', 'studio', 'artist', 'client']).optional(),
          active: z.boolean().optional(),
        })
        .strict()
        .refine((v) => Object.keys(v).length > 0),
      req.body,
    );
    await transaction(pool, async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1)', [7912056]);
      const user = (
        await db.query('SELECT id,name,role,active FROM venue_app.users WHERE id=$1 FOR UPDATE', [
          userId,
        ])
      ).rows[0];
      if (!user) throw new HttpError(404, 'Account not found.');
      if (userId === req.user.id && (v.active === false || (v.role && v.role !== 'admin')))
        throw new HttpError(400, 'You cannot remove your own administrator access.');
      if (user.role === 'admin' && (v.active === false || (v.role && v.role !== 'admin'))) {
        const admins = Number(
          (
            await db.query(
              "SELECT count(*) FROM venue_app.users WHERE role='admin' AND active=true",
            )
          ).rows[0].count,
        );
        if (admins <= 1) throw new HttpError(400, 'Keep at least one active administrator.');
      }
      await db.query(
        'UPDATE venue_app.users SET role=$1,active=$2,session_version=session_version+1,updated_at=now() WHERE id=$3',
        [v.role || user.role, v.active ?? user.active, userId],
      );
      const nextRole=v.role||user.role;
      if(['artist','studio','admin'].includes(nextRole)&&!(await db.query('SELECT 1 FROM venue_app.artist_profiles WHERE user_id=$1',[userId])).rowCount){const studioId=randomUUID();const slug='artist-'+userId.slice(0,12);await db.query('INSERT INTO venue_app.studios(id,owner_id,name,slug) VALUES($1,$2,$3,$4)',[studioId,userId,user.name+' Studio',slug]);await db.query('INSERT INTO venue_app.artist_profiles(user_id,studio_id,slug,display_name) VALUES($1,$2,$3,$4)',[userId,studioId,slug,user.name]);}
      if(nextRole==='client'||v.active===false){await db.query('UPDATE venue_app.artist_profiles SET published=false,books_open=false WHERE user_id=$1',[userId]);await db.query('UPDATE venue_app.studios SET published=false WHERE owner_id=$1',[userId]);}
      await audit(db, req.user, 'account.updated', userId, v);
    });
    res.json({ ok: true });
  });
  app.get('/api/admin/support', async (_req, res) =>
    res.json({
      requests: (
        await pool.query(
          'SELECT id,reference,user_id,name,email,category,studio_name,message,status,reply,created_at,updated_at FROM venue_app.support_requests ORDER BY created_at DESC LIMIT 200',
        )
      ).rows,
    }),
  );
  app.patch('/api/admin/support/:id', async (req, res) => {
    const requestId = parse(id, req.params.id);
    const v = parse(
      z
        .object({
          status: z.enum(['open', 'in_progress', 'resolved']),
          reply: z.string().trim().max(5000),
        })
        .strict(),
      req.body,
    );
    const updated = (
      await pool.query(
        'UPDATE venue_app.support_requests SET status=$1,reply=$2,updated_at=now() WHERE id=$3 RETURNING user_id,reference',
        [v.status, v.reply, requestId],
      )
    ).rows[0];
    if (!updated) throw new HttpError(404, 'Support enquiry not found.');
    if (updated.user_id)
      await notify(pool, updated.user_id, 'Your support enquiry was updated', updated.reference);
    await audit(pool, req.user, 'support.updated', requestId, { status: v.status });
    res.json({ ok: true });
  });
  app.get('/api/admin/articles', async (_req, res) =>
    res.json({
      articles: (
        await pool.query(
          'SELECT id,slug,title,category,excerpt,body,image_name,author_name,published,published_at FROM venue_app.articles ORDER BY published_at DESC LIMIT 100',
        )
      ).rows,
    }),
  );
  const saveArticle = async (req, res) => {
    const v = parse(articleInput, req.body);
    const articleId = req.params.id ? parse(id, req.params.id) : randomUUID();
    if (
      req.params.id &&
      !(await pool.query('SELECT 1 FROM venue_app.articles WHERE id=$1', [articleId])).rowCount
    )
      throw new HttpError(404, 'Article not found.');
    await pool.query(
      'INSERT INTO venue_app.articles(id,slug,title,category,excerpt,body,image_name,author_name,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,category=excluded.category,excerpt=excluded.excerpt,body=excluded.body,image_name=excluded.image_name,author_name=excluded.author_name,published=excluded.published,updated_at=now()',
      [
        articleId,
        v.slug,
        v.title,
        v.category,
        v.excerpt,
        v.body,
        v.imageName,
        v.authorName,
        v.published,
      ],
    );
    await audit(pool, req.user, 'article.saved', articleId);
    res.status(req.params.id ? 200 : 201).json({ article: { id: articleId } });
  };
  app.post('/api/admin/articles', saveArticle);
  app.put('/api/admin/articles/:id', saveArticle);
  app.get('/api/admin/settings', async (_req, res) =>
    res.json({
      settings: (
        await pool.query(
          "SELECT brand_name,payment_email,currency,timezone,booking_notice FROM venue_app.settings WHERE id='site'",
        )
      ).rows[0],
    }),
  );
  app.put('/api/admin/settings', async (req, res) => {
    const v = parse(
      z
        .object({
          brandName: z.string().trim().min(2).max(80),
          paymentEmail: email,
          currency: z.literal('USD'),
          timezone,
          bookingNotice: z.string().trim().min(10).max(500),
        })
        .strict(),
      req.body,
    );
    await pool.query(
      "UPDATE venue_app.settings SET brand_name=$1,payment_email=$2,currency=$3,timezone=$4,booking_notice=$5,updated_at=now() WHERE id='site'",
      [v.brandName, v.paymentEmail, v.currency, v.timezone, v.bookingNotice],
    );
    await audit(pool, req.user, 'settings.updated', 'site');
    res.json({ ok: true });
  });
  app.get('/api/admin/audit', async (_req, res) =>
    res.json({
      entries: (
        await pool.query(
          'SELECT a.id,a.action,a.entity_id,a.details,a.created_at,u.name AS actor_name FROM venue_app.audit_logs a LEFT JOIN venue_app.users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 200',
        )
      ).rows,
    }),
  );
}
