ALTER TABLE venue_app.services ADD COLUMN preset_key text;
--> statement-breakpoint
CREATE UNIQUE INDEX services_artist_preset_idx ON venue_app.services(artist_id,preset_key) WHERE preset_key IS NOT NULL;
--> statement-breakpoint
CREATE TABLE venue_app.studio_service_presets (
 studio_id uuid PRIMARY KEY REFERENCES venue_app.studios(id) ON DELETE CASCADE,
 services jsonb NOT NULL CHECK(jsonb_typeof(services)='array'),
 updated_by uuid REFERENCES venue_app.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
