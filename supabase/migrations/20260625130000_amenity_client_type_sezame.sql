-- Allow the "sezame" client_type on amenity_bookings.
-- The app exposes sezame as a first-class amenity client type, but the
-- CHECK constraint only permitted external/internal/lymfea, which made
-- creating/editing a sezame booking fail.

ALTER TABLE public.amenity_bookings
  DROP CONSTRAINT IF EXISTS amenity_bookings_client_type_check;

ALTER TABLE public.amenity_bookings
  ADD CONSTRAINT amenity_bookings_client_type_check
  CHECK (client_type = ANY (ARRAY['external'::text, 'internal'::text, 'lymfea'::text, 'sezame'::text]));
