ALTER TABLE venue_app.users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE venue_app.users ADD COLUMN mfa_secret text;
ALTER TABLE venue_app.users ADD COLUMN mfa_pending_secret text;
ALTER TABLE venue_app.users ADD COLUMN mfa_pending_expires_at timestamptz;
ALTER TABLE venue_app.users ADD COLUMN mfa_last_step bigint NOT NULL DEFAULT -1;
ALTER TABLE venue_app.users ADD COLUMN recovery_hashes jsonb NOT NULL DEFAULT '[]';
ALTER TABLE venue_app.users ADD COLUMN email_notifications boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE venue_app.sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES venue_app.users(id) ON DELETE CASCADE,
 user_agent text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON venue_app.sessions(user_id,expires_at);
--> statement-breakpoint
CREATE TABLE venue_app.account_tokens (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES venue_app.users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('reset','verify')), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_tokens_user_idx ON venue_app.account_tokens(user_id,purpose);
--> statement-breakpoint
CREATE TABLE venue_app.email_outbox (
 id uuid PRIMARY KEY, user_id uuid REFERENCES venue_app.users(id) ON DELETE CASCADE,
 subject text NOT NULL, encrypted_message text NOT NULL, dedupe_key text NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','sent','failed')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz, sent_at timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_due_idx ON venue_app.email_outbox(state,available_at);
--> statement-breakpoint
CREATE TABLE venue_app.booking_reminders (
 booking_id uuid NOT NULL REFERENCES venue_app.bookings(id) ON DELETE CASCADE,
 starts_at timestamptz NOT NULL, PRIMARY KEY(booking_id,starts_at)
);
CREATE TABLE venue_app.privacy_requests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES venue_app.users(id),
 kind text NOT NULL CHECK(kind IN ('erasure','correction')),
 reason text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
 resolution text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
--> statement-breakpoint
CREATE TABLE venue_app.worker_heartbeats (
 name text PRIMARY KEY, last_run_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON venue_app.audit_logs(created_at,id);
CREATE INDEX users_created_idx ON venue_app.users(created_at,id);
--> statement-breakpoint
ALTER TABLE venue_app.notifications ADD COLUMN email_scheduled boolean NOT NULL DEFAULT true;
ALTER TABLE venue_app.notifications ALTER COLUMN email_scheduled SET DEFAULT false;
--> statement-breakpoint
CREATE TABLE venue_app.card_checkouts (
 id uuid PRIMARY KEY, booking_id uuid NOT NULL REFERENCES venue_app.bookings(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES venue_app.users(id), purpose text NOT NULL CHECK(purpose IN ('deposit','balance')),
 amount_cents integer NOT NULL CHECK(amount_cents>0), currency text NOT NULL,
 request_key text NOT NULL, stripe_session_id text UNIQUE, checkout_url text,
 state text NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','open','paid','expired')),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE INDEX card_checkouts_booking_idx ON venue_app.card_checkouts(booking_id,state);
CREATE TABLE venue_app.provider_events (
 id text PRIMARY KEY, type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE venue_app.refunds (
 id uuid PRIMARY KEY, payment_id uuid NOT NULL REFERENCES venue_app.payment_requests(id),
 amount_cents integer NOT NULL CHECK(amount_cents>0), reason text NOT NULL,
 provider_id text UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','failed')),
 request_key text NOT NULL UNIQUE, created_by uuid REFERENCES venue_app.users(id),
 succeeded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE venue_app.payment_requests ADD COLUMN provider_payment_id text UNIQUE;
--> statement-breakpoint
CREATE TABLE venue_app.studio_access (
 studio_id uuid NOT NULL REFERENCES venue_app.studios(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES venue_app.users(id) ON DELETE CASCADE,
 access_role text NOT NULL CHECK(access_role IN ('manager','receptionist','finance')),
 granted_by uuid NOT NULL REFERENCES venue_app.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(studio_id,user_id)
);
--> statement-breakpoint
CREATE TABLE venue_app.sso_identities (
 issuer text NOT NULL, subject text NOT NULL, user_id uuid NOT NULL REFERENCES venue_app.users(id) ON DELETE CASCADE,
 PRIMARY KEY(issuer,subject), UNIQUE(issuer,user_id)
);
CREATE TABLE venue_app.sso_challenges (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES venue_app.users(id) ON DELETE CASCADE,
 session_version integer NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz
);
--> statement-breakpoint
CREATE TABLE venue_app.auth_attempts (
 key text PRIMARY KEY, attempts integer NOT NULL, window_started_at timestamptz NOT NULL DEFAULT now()
);
