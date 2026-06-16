-- =========================================================================
-- Add external identifiers to bookings (partner API)
-- =========================================================================
-- The partner booking API (POST /v1/venues/:id/bookings) lets third-party tools
-- (Staycation, ClassPass, …) create bookings on behalf of a guest. We persist:
--
--   external_reference : the partner's provenance string, formatted "source.XXXX"
--                        (its prefix is mapped to client_type).
--   external_id        : the calling tool's own technical reference for the
--                        request. Doubles as an idempotency key so a retried
--                        POST does not create a duplicate booking.
-- =========================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS external_id text;

COMMENT ON COLUMN public.bookings.external_reference IS 'Partner provenance string ("source.XXXX"); prefix maps to client_type.';
COMMENT ON COLUMN public.bookings.external_id IS 'Calling tool''s own reference for the request. Idempotency key (unique per venue).';

-- Idempotence: an external_id can reference at most one booking per venue.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_external_id_per_hotel_uniq
  ON public.bookings (hotel_id, external_id)
  WHERE external_id IS NOT NULL;
