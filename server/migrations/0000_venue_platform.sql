CREATE SCHEMA IF NOT EXISTS venue_app;
--> statement-breakpoint
CREATE TABLE venue_app.users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 password_hash text NOT NULL, role text NOT NULL DEFAULT 'client' CHECK(role IN ('admin','studio','artist','client')),
 active boolean NOT NULL DEFAULT true, session_version integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.studios (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES venue_app.users(id),
 name text NOT NULL, slug text NOT NULL UNIQUE, bio text NOT NULL DEFAULT '',
 location text NOT NULL DEFAULT '', timezone text NOT NULL DEFAULT 'UTC',
 published boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.artist_profiles (
 user_id uuid PRIMARY KEY REFERENCES venue_app.users(id), studio_id uuid REFERENCES venue_app.studios(id),
 slug text NOT NULL UNIQUE, display_name text NOT NULL, bio text NOT NULL DEFAULT '',
 styles jsonb NOT NULL DEFAULT '[]', theme text NOT NULL DEFAULT 'paper' CHECK(theme IN ('paper','ink','lavender')),
 image_url text, published boolean NOT NULL DEFAULT false, books_open boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.services (
 id uuid PRIMARY KEY, studio_id uuid REFERENCES venue_app.studios(id), name text NOT NULL,
 description text NOT NULL DEFAULT '', category text NOT NULL DEFAULT 'Tattoo',
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 15 AND 480),
 price_cents integer CHECK(price_cents >= 0), deposit_cents integer NOT NULL DEFAULT 0 CHECK(deposit_cents >= 0),
 currency text NOT NULL DEFAULT 'USD', active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.availability (
 id uuid PRIMARY KEY, artist_id uuid NOT NULL REFERENCES venue_app.artist_profiles(user_id),
 weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6), start_time time NOT NULL,
 end_time time NOT NULL, UNIQUE(artist_id,weekday), CHECK(end_time > start_time)
);
--> statement-breakpoint
CREATE TABLE venue_app.events (
 id uuid PRIMARY KEY, studio_id uuid NOT NULL REFERENCES venue_app.studios(id),
 artist_id uuid NOT NULL REFERENCES venue_app.artist_profiles(user_id), service_id uuid NOT NULL REFERENCES venue_app.services(id),
 title text NOT NULL, description text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '',
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, capacity integer NOT NULL DEFAULT 10 CHECK(capacity BETWEEN 1 AND 200),
 published boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at > starts_at)
);
--> statement-breakpoint
CREATE TABLE venue_app.assets (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES venue_app.users(id),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
 filename text NOT NULL, byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 2097152),
 data bytea NOT NULL, public boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.flash_designs (
 id uuid PRIMARY KEY, artist_id uuid NOT NULL REFERENCES venue_app.artist_profiles(user_id),
 title text NOT NULL, description text NOT NULL DEFAULT '', category text NOT NULL DEFAULT 'Custom',
 asset_id uuid NOT NULL REFERENCES venue_app.assets(id), price_cents integer CHECK(price_cents >= 0),
 size_note text NOT NULL DEFAULT '', placement_note text NOT NULL DEFAULT '',
 repeatable boolean NOT NULL DEFAULT true, published boolean NOT NULL DEFAULT false,
 archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.bookings (
 id uuid PRIMARY KEY, reference text NOT NULL UNIQUE, client_id uuid NOT NULL REFERENCES venue_app.users(id),
 artist_id uuid NOT NULL REFERENCES venue_app.artist_profiles(user_id), service_id uuid NOT NULL REFERENCES venue_app.services(id),
 flash_id uuid REFERENCES venue_app.flash_designs(id), event_id uuid REFERENCES venue_app.events(id),
 title text NOT NULL, notes text NOT NULL DEFAULT '', placement text NOT NULL DEFAULT '', size_note text NOT NULL DEFAULT '',
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','declined','cancelled','completed')),
 quote_cents integer CHECK(quote_cents >= 0), deposit_cents integer NOT NULL DEFAULT 0 CHECK(deposit_cents >= 0),
 currency text NOT NULL DEFAULT 'USD', cancellation_note text NOT NULL DEFAULT '',
 idempotency_key text NOT NULL, request_hash text NOT NULL, consent_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,idempotency_key), CHECK(ends_at > starts_at)
);
--> statement-breakpoint
CREATE INDEX bookings_artist_time_idx ON venue_app.bookings(artist_id,starts_at,ends_at) WHERE status IN ('confirmed','completed');
CREATE INDEX bookings_client_idx ON venue_app.bookings(client_id,created_at DESC);
CREATE INDEX bookings_status_idx ON venue_app.bookings(status,created_at DESC);
--> statement-breakpoint
CREATE TABLE venue_app.booking_assets (
 booking_id uuid NOT NULL REFERENCES venue_app.bookings(id) ON DELETE CASCADE,
 asset_id uuid NOT NULL REFERENCES venue_app.assets(id), PRIMARY KEY(booking_id,asset_id)
);
--> statement-breakpoint
CREATE TABLE venue_app.messages (
 id uuid PRIMARY KEY, booking_id uuid NOT NULL REFERENCES venue_app.bookings(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES venue_app.users(id), body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_booking_idx ON venue_app.messages(booking_id,created_at);
--> statement-breakpoint
CREATE TABLE venue_app.payment_requests (
 id uuid PRIMARY KEY, booking_id uuid NOT NULL REFERENCES venue_app.bookings(id), user_id uuid NOT NULL REFERENCES venue_app.users(id),
 method text NOT NULL, purpose text NOT NULL DEFAULT 'balance' CHECK(purpose IN ('deposit','balance')), amount_cents integer CHECK(amount_cents > 0), currency text NOT NULL,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','received','cancelled')),
 receipt_reference text NOT NULL DEFAULT '', recorded_by uuid REFERENCES venue_app.users(id),
 idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), received_at timestamptz,
 UNIQUE(user_id,idempotency_key)
);
--> statement-breakpoint
CREATE TABLE venue_app.support_requests (
 id uuid PRIMARY KEY, reference text NOT NULL UNIQUE, user_id uuid REFERENCES venue_app.users(id),
 name text NOT NULL, email text NOT NULL, category text NOT NULL, studio_name text NOT NULL DEFAULT '',
 message text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
 reply text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.articles (
 id uuid PRIMARY KEY, slug text NOT NULL UNIQUE, title text NOT NULL, category text NOT NULL,
 excerpt text NOT NULL, body text NOT NULL, image_name text NOT NULL, author_name text NOT NULL,
 published boolean NOT NULL DEFAULT true, published_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.saved_designs (
 user_id uuid NOT NULL REFERENCES venue_app.users(id), design_id uuid NOT NULL REFERENCES venue_app.flash_designs(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,design_id)
);
--> statement-breakpoint
CREATE TABLE venue_app.notifications (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES venue_app.users(id), title text NOT NULL,
 body text NOT NULL DEFAULT '', booking_id uuid REFERENCES venue_app.bookings(id), read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON venue_app.notifications(user_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE venue_app.invitations (
 id uuid PRIMARY KEY, studio_id uuid NOT NULL REFERENCES venue_app.studios(id), email text NOT NULL,
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, accepted_at timestamptz,
 created_by uuid NOT NULL REFERENCES venue_app.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.ideas (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES venue_app.users(id), title text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.settings (
 id text PRIMARY KEY DEFAULT 'site' CHECK(id='site'),
 brand_name text NOT NULL DEFAULT 'Venue', payment_email text NOT NULL DEFAULT 'payment@venue.com',
 currency text NOT NULL DEFAULT 'USD', timezone text NOT NULL DEFAULT 'Europe/Amsterdam',
 booking_notice text NOT NULL DEFAULT 'Your artist reviews your request before confirming an appointment.',
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE venue_app.audit_logs (
 id uuid PRIMARY KEY, actor_id uuid REFERENCES venue_app.users(id), action text NOT NULL,
 entity_id text, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
