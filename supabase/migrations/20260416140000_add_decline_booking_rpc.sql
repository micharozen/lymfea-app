-- ============================================================
-- Fonction RPC sécurisée : refus d'une réservation par un thérapeute
--
-- Contexte : un thérapeute peut refuser une demande de soin en attente
-- sans proposer d'alternative. La réservation reste visible pour les
-- autres thérapeutes affiliés à l'hôtel concerné.
--
-- Problème résolu : la RLS UPDATE sur bookings empêchait les thérapeutes
-- de modifier declined_by sur des réservations non-assignées (therapist_id = NULL).
-- Une policy UPDATE dédiée aurait été trop permissive (accès à toutes les colonnes).
-- On utilise donc une fonction SECURITY DEFINER qui contient toute la logique métier.
-- ============================================================

-- Nettoyage : suppression de l'éventuelle policy UPDATE créée manuellement
-- lors du débogage local (ne fait rien si elle n'existe pas)
DROP POLICY IF EXISTS "Therapists can decline pending bookings at their venues" ON public.bookings;

-- ============================================================
-- Fonction decline_booking
-- Appelée depuis la PWA thérapeute via supabase.rpc('decline_booking', { _booking_id })
-- ============================================================
CREATE OR REPLACE FUNCTION public.decline_booking(_booking_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- Prévient les attaques par injection de search_path
AS $$
DECLARE
  _therapist_id UUID;
  _booking_hotel_id TEXT;
  _is_affiliated BOOLEAN;
BEGIN
  -- 1. Résoudre l'identité du thérapeute connecté
  SELECT id INTO _therapist_id
  FROM public.therapists
  WHERE user_id = auth.uid();

  IF _therapist_id IS NULL THEN
    RAISE EXCEPTION 'Accès refusé : profil thérapeute introuvable pour cet utilisateur';
  END IF;

  -- 2. Vérifier que la réservation existe et est bien en statut "pending"
  --    (un thérapeute ne doit pas pouvoir refuser une résa déjà confirmée ou annulée)
  SELECT hotel_id INTO _booking_hotel_id
  FROM public.bookings
  WHERE id = _booking_id
    AND status = 'pending'
    AND therapist_id IS NULL;

  IF _booking_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Réservation introuvable, déjà assignée ou non en attente';
  END IF;

  -- 3. Vérifier que le thérapeute est bien affilié à l'hôtel de la réservation
  --    (empêche un thérapeute d'un autre hôtel d'appeler le RPC directement)
  SELECT EXISTS(
    SELECT 1 FROM public.therapist_venues
    WHERE therapist_id = _therapist_id
      AND hotel_id = _booking_hotel_id
  ) INTO _is_affiliated;

  IF NOT _is_affiliated THEN
    RAISE EXCEPTION 'Accès refusé : ce thérapeute n''est pas affilié à l''hôtel de cette réservation';
  END IF;

  -- 4. Ajouter le thérapeute à declined_by de façon idempotente
  --    (array_append uniquement s'il n'y est pas déjà — évite les doublons)
  UPDATE public.bookings
  SET declined_by = array_append(COALESCE(declined_by, ARRAY[]::uuid[]), _therapist_id)
  WHERE id = _booking_id
    AND NOT (COALESCE(declined_by, ARRAY[]::uuid[]) @> ARRAY[_therapist_id]);

  -- Note : si le thérapeute était déjà dans declined_by, UPDATE affecte 0 lignes — comportement attendu.
END;
$$;

-- Permission d'appel : uniquement les utilisateurs authentifiés
-- (la fonction vérifie elle-même le rôle thérapeute en interne)
GRANT EXECUTE ON FUNCTION public.decline_booking(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decline_booking(UUID) FROM anon;
