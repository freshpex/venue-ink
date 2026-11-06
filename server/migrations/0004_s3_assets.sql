ALTER TABLE venue_app.assets ADD COLUMN storage_provider text NOT NULL DEFAULT 'database' CHECK(storage_provider IN ('database','s3'));
--> statement-breakpoint
ALTER TABLE venue_app.assets ADD COLUMN storage_key text;
--> statement-breakpoint
ALTER TABLE venue_app.assets ALTER COLUMN data DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE venue_app.assets ADD CONSTRAINT asset_storage_location CHECK ((storage_provider='database' AND data IS NOT NULL) OR (storage_provider='s3' AND data IS NULL AND bucket IS NOT NULL AND storage_key IS NOT NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX assets_s3_key_idx ON venue_app.assets(bucket,storage_key) WHERE storage_provider='s3';
--> statement-breakpoint
CREATE TABLE venue_app.asset_object_deletions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket text NOT NULL, storage_key text NOT NULL,
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(bucket,storage_key)
);
--> statement-breakpoint
CREATE INDEX asset_object_deletions_due_idx ON venue_app.asset_object_deletions(next_attempt_at);
--> statement-breakpoint
CREATE FUNCTION venue_app.queue_asset_object_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.storage_provider='s3' THEN
  INSERT INTO venue_app.asset_object_deletions(bucket,storage_key) VALUES(OLD.bucket,OLD.storage_key) ON CONFLICT DO NOTHING;
 END IF;
 RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER asset_object_deletion AFTER DELETE ON venue_app.assets FOR EACH ROW EXECUTE FUNCTION venue_app.queue_asset_object_deletion();
