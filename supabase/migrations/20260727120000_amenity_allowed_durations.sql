-- Allow each venue to offer several booking durations for an amenity (e.g. a pool
-- bookable for 30 min or 1h) instead of the single fixed `slot_duration`.
-- `slot_duration` is kept and becomes the *default* duration pre-selected when
-- creating a booking; `allowed_durations` lists everything selectable.

ALTER TABLE "public"."venue_amenities"
  ADD COLUMN IF NOT EXISTS "allowed_durations" integer[] NOT NULL DEFAULT '{}'::integer[];

COMMENT ON COLUMN "public"."venue_amenities"."allowed_durations" IS
  'Durations (minutes) selectable when booking this amenity. Empty means only slot_duration.';

COMMENT ON COLUMN "public"."venue_amenities"."slot_duration" IS
  'Default booking duration in minutes; must be one of allowed_durations.';

-- Existing amenities keep their current behaviour: a single duration.
UPDATE "public"."venue_amenities"
SET "allowed_durations" = ARRAY["slot_duration"]
WHERE "allowed_durations" = '{}'::integer[];
