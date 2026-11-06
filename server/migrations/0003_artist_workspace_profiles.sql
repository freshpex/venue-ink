ALTER TABLE venue_app.users ADD COLUMN image_url text;
--> statement-breakpoint
ALTER TABLE venue_app.studios ADD COLUMN image_url text;
--> statement-breakpoint
ALTER TABLE venue_app.artist_profiles ADD COLUMN deleted_at timestamptz;
--> statement-breakpoint
ALTER TABLE venue_app.services ADD COLUMN artist_id uuid REFERENCES venue_app.artist_profiles(user_id);
--> statement-breakpoint
CREATE INDEX services_artist_idx ON venue_app.services(artist_id) WHERE artist_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE venue_app.assets ADD COLUMN bucket text;
--> statement-breakpoint
CREATE FUNCTION venue_app.check_booking_artist_service() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM venue_app.services WHERE id=NEW.service_id AND artist_id IS NOT NULL AND artist_id<>NEW.artist_id) THEN
    RAISE EXCEPTION 'The service is assigned to another artist.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER booking_artist_service_guard BEFORE INSERT OR UPDATE OF artist_id,service_id ON venue_app.bookings FOR EACH ROW EXECUTE FUNCTION venue_app.check_booking_artist_service();
