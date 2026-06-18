-- Allow 'phone' as a booking source (used by the admin Phone booking FAB).
-- Previously the check only permitted admin/client/email/pwa/api, so the
-- Phone FAB (source='phone') and any unset source ('manual') hit a 23514 violation.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_source_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_source_check
  CHECK (source = ANY (ARRAY['admin'::text, 'client'::text, 'email'::text, 'pwa'::text, 'api'::text, 'phone'::text]));
