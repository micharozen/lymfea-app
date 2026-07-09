-- Stable soin↔therapist link: which therapist performs each treatment line.
-- Until now the pairing was only positional (booking_treatments index ↔ booking_therapists
-- ordered by assigned_at), which is not persisted and can reorder. This column makes it explicit.
--
-- Scope: meaningful for combo-duos (N treatments = N therapists) and solos. For shared-duos
-- (1 treatment, N therapists) it stays NULL — booking_therapists remains the source there.
-- booking_therapists is NOT replaced: it stays the roster + broadcast acceptance queue.
--
-- Nullable, no backfill: existing rows keep NULL and fall back to the positional display.
-- The explicit link only applies to bookings created/converted after this migration.

ALTER TABLE public.booking_treatments
  ADD COLUMN IF NOT EXISTS therapist_id uuid REFERENCES public.therapists(id);

COMMENT ON COLUMN public.booking_treatments.therapist_id IS
  'Therapist performing this treatment line (stable soin↔therapist link). NULL = fall back to positional mapping. Only meaningful for combo-duos/solos.';

CREATE INDEX IF NOT EXISTS idx_booking_treatments_therapist
  ON public.booking_treatments(therapist_id);

-- RLS: booking_treatments had INSERT/DELETE/SELECT policies but no UPDATE.
-- Add UPDATE for admins (full) and concierges (their hotels), mirroring the existing
-- booking_treatments INSERT/DELETE policies.

CREATE POLICY "Admins can update booking treatments"
  ON public.booking_treatments FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Concierges can update booking treatments for their hotels"
  ON public.booking_treatments FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.hotel_id IN (
        SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND booking_id IN (
      SELECT b.id FROM public.bookings b
      WHERE b.hotel_id IN (
        SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())
      )
    )
  );
