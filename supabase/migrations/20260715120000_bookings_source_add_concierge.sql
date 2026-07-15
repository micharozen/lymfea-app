-- Allow 'concierge' as a booking source: bookings created from the venue-management
-- context (concierge role, or an admin in venue_manager view mode) are now tagged
-- source='concierge' so the booking detail header can show "Gestion du lieu" as the
-- origin, distinct from "Admin" (dashboard) and "Site" (client flow).
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_source_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_source_check
  CHECK (source = ANY (ARRAY['admin'::text, 'client'::text, 'email'::text, 'pwa'::text, 'api'::text, 'phone'::text, 'concierge'::text]));
