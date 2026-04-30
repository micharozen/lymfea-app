-- ============================================================
-- Fix decline_booking : allow declining when therapist_id is
-- assigned to the caller (not just when it is NULL).
--
-- Context: reserve_trunk_atomically assigns a therapist_id at
-- booking creation for availability checking. The old RPC blocked
-- decline when therapist_id was set. Now:
--   - The assigned therapist can decline their own booking.
--   - therapist_id is cleared on decline so the booking goes back
--     to the unassigned pool for gender-fallback notifications.
-- ============================================================
CREATE OR REPLACE FUNCTION public.decline_booking(_booking_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _therapist_id UUID;
  _booking_hotel_id TEXT;
  _is_affiliated BOOLEAN;
BEGIN
  -- 1. Resolve connected therapist identity
  SELECT id INTO _therapist_id
  FROM public.therapists
  WHERE user_id = auth.uid();

  IF _therapist_id IS NULL THEN
    RAISE EXCEPTION 'Accès refusé : profil thérapeute introuvable pour cet utilisateur';
  END IF;

  -- 2. Check booking exists, is pending, and either unassigned OR assigned to this therapist
  SELECT hotel_id INTO _booking_hotel_id
  FROM public.bookings
  WHERE id = _booking_id
    AND status = 'pending'
    AND (therapist_id IS NULL OR therapist_id = _therapist_id);

  IF _booking_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Réservation introuvable, déjà assignée ou non en attente';
  END IF;

  -- 3. Check therapist is affiliated to the booking's hotel
  SELECT EXISTS(
    SELECT 1 FROM public.therapist_venues
    WHERE therapist_id = _therapist_id
      AND hotel_id = _booking_hotel_id
  ) INTO _is_affiliated;

  IF NOT _is_affiliated THEN
    RAISE EXCEPTION 'Accès refusé : ce thérapeute n''est pas affilié à l''hôtel de cette réservation';
  END IF;

  -- 4. Add to declined_by (idempotent) and clear therapist_id so the
  --    booking returns to the unassigned pool for gender-fallback dispatch
  UPDATE public.bookings
  SET
    declined_by  = array_append(COALESCE(declined_by, ARRAY[]::uuid[]), _therapist_id),
    therapist_id = NULL
  WHERE id = _booking_id
    AND NOT (COALESCE(declined_by, ARRAY[]::uuid[]) @> ARRAY[_therapist_id]);

END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_booking(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decline_booking(UUID) FROM anon;
