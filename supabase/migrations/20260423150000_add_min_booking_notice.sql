-- ==============================================================================
-- Migration : add_min_booking_notice
-- Description : Ajoute un délai minimum de réservation configurable par lieu.
--   Distinct du lead_time des soins (délai de préparation spécifique), ce champ
--   représente une politique commerciale globale : on n'accepte pas les
--   réservations de dernière minute en deçà de ce délai, quel que soit le soin.
--   Le délai effectif appliqué est max(treatment.lead_time, venue.min_booking_notice).
-- ==============================================================================

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS min_booking_notice_minutes INTEGER DEFAULT 0;

COMMENT ON COLUMN public.hotels.min_booking_notice_minutes IS
  'Délai minimum (en minutes) entre maintenant et l''heure du créneau réservable. 0 = pas de délai.';
