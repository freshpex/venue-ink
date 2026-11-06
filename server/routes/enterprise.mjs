import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError, parse, id } from '../validation.mjs';
import { audit, bookingFields, bookingJoins, bookingScope } from '../domain.mjs';
import { csv, pagination } from '../security.mjs';

export function enterpriseRoutes(app, { pool }) {
  app.get('/api/account/export', async (req, res) => {
    const userId = req.user.id;
    const queries = {
      account: [
        'SELECT id,name,email,role,created_at,email_verified_at,email_notifications FROM venue_app.users WHERE id=$1',
        [userId],
      ],
      profile: [
        'SELECT user_id,display_name,bio,styles,published,books_open FROM venue_app.artist_profiles WHERE user_id=$1',
        [userId],
      ],
      ideas: [
        'SELECT title,created_at FROM venue_app.ideas WHERE user_id=$1 ORDER BY created_at',
        [userId],
      ],
      support: [
        'SELECT reference,category,message,status,reply,created_at FROM venue_app.support_requests WHERE user_id=$1',
        [userId],
      ],
      bookings: [
        'SELECT id,reference,title,notes,placement,size_note,starts_at,ends_at,status,quote_cents,deposit_cents,currency,created_at FROM venue_app.bookings WHERE client_id=$1 ORDER BY created_at',
        [userId],
      ],
      messages: [
        'SELECT booking_id,body,created_at FROM venue_app.messages WHERE sender_id=$1 ORDER BY created_at',
        [userId],
      ],
      payments: [
        'SELECT booking_id,method,purpose,amount_cents,currency,status,receipt_reference,created_at FROM venue_app.payment_requests WHERE user_id=$1 ORDER BY created_at',
        [userId],
      ],
      images: [
        'SELECT id,filename,mime_type,byte_size,public FROM venue_app.assets WHERE owner_id=$1',
        [userId],
      ],
    };
    const data = { exportedAt: new Date().toISOString() };
    for (const [name, [sql, args]] of Object.entries(queries))
      data[name] = (await pool.query(sql, args)).rows;
    await audit(pool, req.user, 'privacy.exported', userId);
    res.set('Content-Disposition', 'attachment; filename="venue-account.json"').json(data);
  });
  app.get('/api/account/privacy-requests', async (req, res) => {
    res.json({
      requests: (
        await pool.query(
          'SELECT id,kind,reason,status,resolution,created_at,resolved_at FROM venue_app.privacy_requests WHERE user_id=$1 ORDER BY created_at DESC',
          [req.user.id],
        )
      ).rows,
    });
  });
  app.post('/api/account/privacy-requests', async (req, res) => {
    const v = parse(
      z
        .object({
          kind: z.enum(['erasure', 'correction']),
          reason: z.string().trim().min(10).max(2000),
        })
        .strict(),
      req.body,
    );
    const request = (
      await pool.query(
        'INSERT INTO venue_app.privacy_requests(id,user_id,kind,reason) VALUES($1,$2,$3,$4) RETURNING id,status',
        [randomUUID(), req.user.id, v.kind, v.reason],
      )
    ).rows[0];
    await audit(pool, req.user, 'privacy.requested', request.id, { kind: v.kind });
    res.status(201).json({ request });
  });
  app.get('/api/bookings-search', async (req, res) => {
    const { page, limit, offset } = pagination(req.query);
    const scope = bookingScope(req.user);
    const args = [...scope.params];
    let where = scope.clause;
    const add = (sql, value) => {
      args.push(value);
      where += ' AND ' + sql.replaceAll('?', '$' + args.length);
    };
    if (req.query.clientId) add('b.client_id=?', parse(id, req.query.clientId));
    if (req.query.status)
      add(
        'b.status=?',
        parse(
          z.enum(['pending', 'confirmed', 'completed', 'declined', 'cancelled']),
          req.query.status,
        ),
      );
    if (req.query.search)
      add(
        '(b.title ILIKE ? OR u.name ILIKE ? OR a.display_name ILIKE ? OR st.name ILIKE ? OR b.reference ILIKE ?)',
        '%' + String(req.query.search).slice(0, 100) + '%',
      );
    if (req.query.month) {
      const month = parse(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), req.query.month);
      add('b.starts_at>=?::date', month + '-01');
      add("b.starts_at<(?::date+interval '1 month')", month + '-01');
    }
    const total = Number(
      (await pool.query('SELECT count(*) ' + bookingJoins + ' WHERE ' + where, args)).rows[0].count,
    );
    args.push(limit, offset);
    const bookings = (
      await pool.query(
        'SELECT ' +
          bookingFields +
          ' ' +
          bookingJoins +
          ' WHERE ' +
          where +
          ' ORDER BY b.starts_at DESC,b.id LIMIT $' +
          (args.length - 1) +
          ' OFFSET $' +
          args.length,
        args,
      )
    ).rows;
    res.json({ bookings, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
  app.use('/api/admin', (req, _res, next) =>
    req.user.role === 'admin'
      ? next()
      : next(new HttpError(403, 'Administrator access is required.')),
  );
  app.get('/api/admin/reports', async (req, res) => {
    const from = parse(
      z.iso.date(),
      req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    );
    const to = parse(
      z.iso.date(),
      req.query.to || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    );
    if (from >= to) throw new HttpError(400, 'The end date must be after the start date.');
    const statuses = (
      await pool.query(
        'SELECT status,count(*)::integer AS count FROM venue_app.bookings WHERE created_at >= $1::date AND created_at < $2::date GROUP BY status ORDER BY status',
        [from, to],
      )
    ).rows;
    const payments = (
      await pool.query(
        "SELECT currency,COALESCE(sum(amount_cents),0)::bigint AS received_cents,count(*)::integer AS count FROM venue_app.payment_requests WHERE status='received' AND received_at >= $1::date AND received_at < $2::date GROUP BY currency",
        [from, to],
      )
    ).rows;
    const refunds = (
      await pool.query(
        "SELECT p.currency,COALESCE(sum(r.amount_cents),0)::bigint AS refunded_cents,count(*)::integer AS count FROM venue_app.refunds r JOIN venue_app.payment_requests p ON p.id=r.payment_id WHERE r.status='succeeded' AND r.succeeded_at >= $1::date AND r.succeeded_at < $2::date GROUP BY p.currency",
        [from, to],
      )
    ).rows;
    const accounts = (
      await pool.query(
        'SELECT role,count(*)::integer AS count FROM venue_app.users GROUP BY role ORDER BY role',
      )
    ).rows;
    res.json({ from, to, statuses, payments, refunds, accounts });
  });
  app.get('/api/admin/reports/bookings.csv', async (req, res) => {
    const { limit, offset } = pagination(req.query, 200);
    const rows = (
      await pool.query(
        'SELECT ' +
          bookingFields +
          ' ' +
          bookingJoins +
          ' ORDER BY b.created_at DESC,b.id LIMIT $1 OFFSET $2',
        [limit, offset],
      )
    ).rows;
    const output = csv(rows, [
      { key: 'reference', label: 'Booking reference' },
      { key: 'title', label: 'Request' },
      { key: 'client_name', label: 'Client' },
      { key: 'artist_name', label: 'Artist' },
      { key: 'studio_name', label: 'Studio' },
      { key: 'service_name', label: 'Service' },
      { key: 'starts_at', label: 'Starts at (UTC)' },
      { key: 'status', label: 'Status' },
      { key: 'quote_cents', label: 'Quote (cents)' },
      { key: 'paid_cents', label: 'Received (cents)' },
      { key: 'currency', label: 'Currency' },
    ]);
    await audit(pool, req.user, 'report.exported', 'bookings', { limit, offset });
    res
      .type('text/csv')
      .set('Content-Disposition', 'attachment; filename="venue-bookings.csv"')
      .send(output);
  });
  app.get('/api/admin/operations', async (_req, res) => {
    const queue = (
      await pool.query(
        'SELECT state,count(*)::integer AS count FROM venue_app.email_outbox GROUP BY state',
      )
    ).rows;
    const staff = (
      await pool.query(
        "SELECT count(*)::integer AS total,count(mfa_secret)::integer AS protected FROM venue_app.users WHERE active=true AND role<>'client'",
      )
    ).rows[0];
    const heartbeat = (
      await pool.query(
        "SELECT last_run_at FROM venue_app.worker_heartbeats WHERE name='operations'",
      )
    ).rows[0];
    const mailConfigured = !!(
      process.env.MAILJET_API_KEY &&
      process.env.MAILJET_SECRET_KEY &&
      process.env.MAILJET_FROM_EMAIL
    );
    res.json({
      mailConfigured,
      requireStaffMfa: app.locals.requireStaffMfa,
      staff,
      queue,
      workerLastRun: heartbeat?.last_run_at || null,
      workerHealthy: !!heartbeat && Date.now() - new Date(heartbeat.last_run_at).getTime() < 120000,
      checks: [
        {
          label: 'Transactional email',
          ready: mailConfigured,
          detail: mailConfigured
            ? 'Check the delivery queue for updates.'
            : 'Delivery is unavailable. Messages remain queued.',
        },
        {
          label: 'Staff MFA policy',
          ready: app.locals.requireStaffMfa,
          detail: 'REQUIRE_STAFF_MFA enforces authenticator enrollment before staff operations.',
        },
        {
          label: 'Separate data encryption key',
          ready: !!process.env.DATA_ENCRYPTION_KEY,
          detail:
            'Keep DATA_ENCRYPTION_KEY in the secret manager and preserve it across deployments.',
        },
        {
          label: 'Backups and restore',
          ready: false,
          detail: 'Verify encrypted database backups and perform a restore drill.',
        },
      ],
    });
  });
  app.get('/api/admin/deliveries', async (req, res) => {
    const { page, limit, offset } = pagination(req.query);
    const total = Number(
      (await pool.query('SELECT count(*) FROM venue_app.email_outbox')).rows[0].count,
    );
    const deliveries = (
      await pool.query(
        'SELECT e.id,e.subject,e.state,e.attempts,e.last_error,e.created_at,e.sent_at,u.name AS recipient_name FROM venue_app.email_outbox e LEFT JOIN venue_app.users u ON u.id=e.user_id ORDER BY e.created_at DESC,e.id LIMIT $1 OFFSET $2',
        [limit, offset],
      )
    ).rows;
    res.json({ deliveries, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
  app.get('/api/admin/privacy-requests', async (req, res) => {
    const { page, limit, offset } = pagination(req.query);
    const requests = (
      await pool.query(
        'SELECT p.*,u.name,u.email FROM venue_app.privacy_requests p JOIN venue_app.users u ON u.id=p.user_id ORDER BY p.created_at DESC,p.id LIMIT $1 OFFSET $2',
        [limit, offset],
      )
    ).rows;
    const total = Number(
      (await pool.query('SELECT count(*) FROM venue_app.privacy_requests')).rows[0].count,
    );
    res.json({ requests, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
  app.patch('/api/admin/privacy-requests/:id', async (req, res) => {
    const requestId = parse(id, req.params.id);
    const v = parse(
      z
        .object({
          status: z.enum(['open', 'in_progress', 'resolved']),
          resolution: z.string().trim().max(3000),
        })
        .strict()
        .refine(
          (v) => v.status !== 'resolved' || v.resolution.length >= 10,
          'Record the action taken before resolving this request.',
        ),
      req.body,
    );
    const result = await pool.query(
      "UPDATE venue_app.privacy_requests SET status=$1,resolution=$2,resolved_at=CASE WHEN $1='resolved' THEN now() ELSE NULL END WHERE id=$3 RETURNING user_id",
      [v.status, v.resolution, requestId],
    );
    if (!result.rowCount) throw new HttpError(404, 'Privacy request not found.');
    await audit(pool, req.user, 'privacy.updated', requestId, { status: v.status });
    res.json({ ok: true });
  });
}
