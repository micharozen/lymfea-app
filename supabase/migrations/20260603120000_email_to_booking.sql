-- Email-to-Booking (inspired by Salesforce email-to-case).
-- A controlled list of Eïa domains receives forwarded emails. A wildcard route
-- on each domain points to the inbound-email-webhook edge function which:
--   1. inserts an `email_inquiries` row (raw audit trail)
--   2. asks an LLM to extract structured booking data
--   3. (Phase 2+) optionally auto-creates a booking in `waiting_approval`
--
-- This migration only sets up storage + routing columns. Phase 1 keeps
-- everything manual on the admin side.

-- ── hotels: per-venue inbound email address ──────────────────────────────────
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS inbound_email_alias text,
  ADD COLUMN IF NOT EXISTS inbound_email_domain text;

COMMENT ON COLUMN public.hotels.inbound_email_alias IS
  'Local-part of the venue inbound email (e.g. "spa-leroyal" in spa-leroyal@booking.eia.fr). Generated from the venue name.';
COMMENT ON COLUMN public.hotels.inbound_email_domain IS
  'Domain picked from INBOUND_EMAIL_DOMAINS (e.g. booking.eia.fr). Each domain has a wildcard MX route in Resend pointing to the same webhook.';

-- Backfill: existing venues get a slug-based alias on the legacy domain.
-- Uses the existing public.slugify(text) helper.
UPDATE public.hotels h
SET inbound_email_alias = COALESCE(NULLIF(public.slugify(h.name), ''), 'venue-' || LEFT(h.id, 8)),
    inbound_email_domain = 'booking.eia.fr'
WHERE inbound_email_alias IS NULL OR inbound_email_domain IS NULL;

-- Resolve collisions deterministically: append -N to the alias for duplicates
-- on the same domain. Uses row_number ordered by creation date so the oldest
-- venue keeps the bare slug.
WITH ranked AS (
  SELECT id,
         inbound_email_alias,
         inbound_email_domain,
         ROW_NUMBER() OVER (
           PARTITION BY inbound_email_alias, inbound_email_domain
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.hotels
)
UPDATE public.hotels h
SET inbound_email_alias = h.inbound_email_alias || '-' || r.rn
FROM ranked r
WHERE r.id = h.id AND r.rn > 1;

ALTER TABLE public.hotels
  ALTER COLUMN inbound_email_alias SET NOT NULL,
  ALTER COLUMN inbound_email_domain SET NOT NULL;

-- A venue is uniquely identified by (alias, domain). Same slug can co-exist
-- on two distinct domains (allows brand transitions saoma <-> eia without
-- breaking forwarding rules).
CREATE UNIQUE INDEX IF NOT EXISTS hotels_inbound_email_unique
  ON public.hotels (inbound_email_alias, inbound_email_domain);

-- ── bookings: trace the inquiry that produced the booking ────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS email_inquiry_id uuid;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_source_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_source_check
    CHECK (source IN ('admin', 'client', 'email', 'pwa', 'api'));

COMMENT ON COLUMN public.bookings.source IS
  'Origin of the booking: admin dashboard, client public flow, email-to-booking inbox, therapist PWA, or external API.';
COMMENT ON COLUMN public.bookings.email_inquiry_id IS
  'FK to email_inquiries when the booking was created from an inbound email.';

-- ── email_inquiries: raw inbox + parsed payload ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id text REFERENCES public.hotels(id) ON DELETE SET NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  subject text,
  raw_body_text text,
  raw_body_html text,
  raw_payload jsonb,
  parsed_data jsonb,
  confidence_score numeric,
  status text NOT NULL DEFAULT 'received',
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  error_message text,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_inquiries_status_check
    CHECK (status IN ('received', 'parsed', 'converted', 'dismissed', 'failed'))
);

COMMENT ON TABLE public.email_inquiries IS
  'Raw inbox + parsed payload for the email-to-booking flow. One row per inbound email.';
COMMENT ON COLUMN public.email_inquiries.status IS
  'Lifecycle: received → parsed → converted (booking created) | dismissed (admin discarded) | failed (parsing error).';
COMMENT ON COLUMN public.email_inquiries.confidence_score IS
  'LLM-reported intent confidence in 0..1. Phase 2 auto-converts when ≥ 0.8.';

CREATE INDEX IF NOT EXISTS email_inquiries_hotel_id_idx
  ON public.email_inquiries (hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_inquiries_status_idx
  ON public.email_inquiries (status);
CREATE INDEX IF NOT EXISTS email_inquiries_booking_id_idx
  ON public.email_inquiries (booking_id);

-- Auto-touch updated_at
CREATE OR REPLACE FUNCTION public.email_inquiries_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_inquiries_updated_at ON public.email_inquiries;
CREATE TRIGGER email_inquiries_updated_at
  BEFORE UPDATE ON public.email_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.email_inquiries_set_updated_at();

-- RLS: admins of the venue read; service_role inserts/updates from the webhook.
ALTER TABLE public.email_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_inquiries admin read" ON public.email_inquiries;
CREATE POLICY "email_inquiries admin read" ON public.email_inquiries
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'concierge'::public.app_role)
  );

DROP POLICY IF EXISTS "email_inquiries admin update" ON public.email_inquiries;
CREATE POLICY "email_inquiries admin update" ON public.email_inquiries
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'concierge'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'concierge'::public.app_role)
  );

-- Inserts only via service_role (edge function); no INSERT policy for authenticated.
