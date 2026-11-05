import { randomUUID } from 'node:crypto';
import { transaction } from './db.mjs';
import { seal, unseal } from './security.mjs';

export async function enqueueEmail(db, key, { userId, to, subject, text, dedupeKey, expiresAt }) {
  await db.query(
    'INSERT INTO venue_app.email_outbox(id,user_id,subject,encrypted_message,dedupe_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING',
    [
      randomUUID(),
      userId,
      to ? subject : subject.slice(0, 150),
      seal(JSON.stringify({ to, text, expiresAt }), key),
      dedupeKey,
    ],
  );
}
export async function mailjetTransport(
  message,
  { apiKey, secretKey, fromEmail, fromName = 'Venue', fetcher = fetch, signal },
) {
  const response = await fetcher('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    headers: {
      Authorization: 'Basic ' + Buffer.from(apiKey + ':' + secretKey).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: fromEmail, Name: fromName },
          To: [{ Email: message.to }],
          Subject: message.subject,
          TextPart: message.text,
          CustomID: message.id,
          CustomCampaign: message.id,
          DeduplicateCampaign: true,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error('mail_http_' + response.status);
  const result = await response.json();
  if (result.Messages?.length !== 1 || result.Messages[0].Status !== 'success')
    throw new Error('mail_rejected');
}
export async function runOperations(pool, { key, siteUrl, transport, signal }) {
  await transaction(pool, async (db) => {
    // Multiple application replicas serialize scheduling, but never hold this lock over network I/O.
    await db.query('SELECT pg_advisory_xact_lock($1)', [7912057]);
    const reminders = (
      await db.query(
        "SELECT b.id,b.starts_at,b.title,b.client_id,u.email,u.email_notifications,u.active FROM venue_app.bookings b JOIN venue_app.users u ON u.id=b.client_id WHERE b.status='confirmed' AND b.starts_at>now()+interval '1 hour' AND b.starts_at<=now()+interval '24 hours' AND NOT EXISTS(SELECT 1 FROM venue_app.booking_reminders r WHERE r.booking_id=b.id AND r.starts_at=b.starts_at) ORDER BY b.starts_at LIMIT 200",
      )
    ).rows;
    for (const b of reminders) {
      await db.query(
        'INSERT INTO venue_app.booking_reminders(booking_id,starts_at) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [b.id, b.starts_at],
      );
      if (b.active && b.email_notifications)
        await enqueueEmail(db, key, {
          userId: b.client_id,
          to: b.email,
          subject: 'Your Venue appointment is tomorrow',
          text:
            'Your appointment for ' +
            b.title +
            ' is at ' +
            new Date(b.starts_at).toISOString() +
            '.\nView the local time and details: ' +
            siteUrl +
            '/bookings/' +
            b.id,
          expiresAt: new Date(b.starts_at).toISOString(),
          dedupeKey: 'reminder:' + b.id + ':' + new Date(b.starts_at).toISOString(),
        });
    }
    const notifications = (
      await db.query(
        'SELECT n.id,n.user_id,n.title,n.body,n.booking_id,u.email,u.email_notifications,u.active FROM venue_app.notifications n JOIN venue_app.users u ON u.id=n.user_id WHERE n.email_scheduled=false ORDER BY n.created_at LIMIT 200 FOR UPDATE OF n SKIP LOCKED',
      )
    ).rows;
    for (const n of notifications) {
      if (n.active && n.email_notifications)
        await enqueueEmail(db, key, {
          userId: n.user_id,
          to: n.email,
          subject: n.title,
          // Private conversation contents stay in the authenticated workspace.
          text:
            'You have an update in Venue. Sign in to view it: ' +
            siteUrl +
            (n.booking_id ? '/bookings/' + n.booking_id : '/dashboard'),
          dedupeKey: 'notification:' + n.id,
        });
      await db.query('UPDATE venue_app.notifications SET email_scheduled=true WHERE id=$1', [n.id]);
    }
    await db.query(
      "DELETE FROM venue_app.sessions WHERE expires_at<now()-interval '7 days' OR revoked_at<now()-interval '7 days'",
    );
    await db.query("DELETE FROM venue_app.account_tokens WHERE expires_at<now()-interval '7 days'");
    await db.query('DELETE FROM venue_app.sso_challenges WHERE expires_at<now()');
    await db.query(
      "DELETE FROM venue_app.auth_attempts WHERE window_started_at<now()-interval '1 day'",
    );
    // Retain delivery metadata, remove encrypted message contents after seven days.
    await db.query(
      "UPDATE venue_app.email_outbox SET encrypted_message='' WHERE state IN ('sent','failed') AND created_at<now()-interval '7 days' AND encrypted_message<>''",
    );
    await db.query(
      "INSERT INTO venue_app.worker_heartbeats(name) VALUES('operations') ON CONFLICT(name) DO UPDATE SET last_run_at=now()",
    );
  });
  if (!transport) return { configured: false, sent: 0 };
  await pool.query(
    "UPDATE venue_app.email_outbox SET state='pending',locked_at=NULL WHERE state='processing' AND locked_at<now()-interval '10 minutes'",
  );
  const claimed = await transaction(pool, async (db) => {
    const rows = (
      await db.query(
        "SELECT id FROM venue_app.email_outbox WHERE state='pending' AND available_at<=now() AND attempts<8 ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED",
      )
    ).rows;
    const messages = [];
    for (const row of rows)
      messages.push(
        (
          await db.query(
            "UPDATE venue_app.email_outbox SET state='processing',attempts=attempts+1,locked_at=now() WHERE id=$1 RETURNING *",
            [row.id],
          )
        ).rows[0],
      );
    return messages;
  });
  let sent = 0;
  for (const row of claimed) {
    if (signal?.aborted) break;
    try {
      const payload = JSON.parse(unseal(row.encrypted_message, key));
      if (payload.expiresAt && new Date(payload.expiresAt) <= new Date()) {
        await pool.query(
          "UPDATE venue_app.email_outbox SET state='failed',last_error='expired',locked_at=NULL WHERE id=$1",
          [row.id],
        );
        continue;
      }
      await transport({ id: row.id, subject: row.subject, ...payload }, { signal });
      await pool.query(
        "UPDATE venue_app.email_outbox SET state='sent',sent_at=now(),locked_at=NULL,last_error=NULL WHERE id=$1",
        [row.id],
      );
      sent++;
    } catch (error) {
      const next = new Date(Date.now() + Math.min(3600, 30 * 2 ** row.attempts) * 1000);
      // Never persist provider responses, addresses, tokens or exception messages.
      const reason = /^mail_http_\d{3}$/.test(error.message) ? error.message : 'delivery_error';
      await pool.query(
        'UPDATE venue_app.email_outbox SET state=$1,available_at=$2,locked_at=NULL,last_error=$3 WHERE id=$4',
        [row.attempts >= 8 ? 'failed' : 'pending', next, reason, row.id],
      );
    }
  }
  return { configured: true, sent };
}
export function startOperations(pool, options, logger = console) {
  const controller = new AbortController();
  let running = false,
    stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await runOperations(pool, { ...options, signal: controller.signal });
    } catch {
      logger.error(JSON.stringify({ event: 'operations.failed' }));
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 30000);
  timer.unref();
  void tick();
  return async () => {
    stopped = true;
    controller.abort();
    clearInterval(timer);
    while (running) await new Promise((resolve) => setTimeout(resolve, 50));
  };
}
