-- ============================================================
-- Propagation de l'annulation d'un booking vers ses amenity_bookings liés.
--
-- Un treatment « amenity » (piscine, sauna…) crée une ligne amenity_bookings
-- avec linked_booking_id (voir reserve_trunk_atomically). Jusqu'ici, annuler le
-- booking laissait cette ligne en 'confirmed' : le créneau restait consommé sur
-- la capacité de l'amenity, donc invisible à la revente.
--
-- Le correctif est un trigger DB plutôt qu'un patch applicatif : les chemins
-- d'annulation sont multiples (RPC begin_booking_cancellation, begin_booking_noshow,
-- cancel_booking_public, handle-quote-response, checkExpiredPaymentLinks) et
-- l'un d'eux est un cron pg_cron en SQL brut (cancel-expired-prereservations)
-- qu'aucun code applicatif ne peut intercepter.
-- ============================================================

CREATE OR REPLACE FUNCTION public.propagate_booking_status_to_amenities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Annulation / no-show : on libère la capacité de l'amenity.
  IF NEW.status IN ('cancelled', 'Annulé', 'noshow')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.amenity_bookings
    SET status = CASE WHEN NEW.status = 'noshow' THEN 'noshow' ELSE 'cancelled' END
    WHERE linked_booking_id = NEW.id
      AND status = 'confirmed';

  -- Retour en arrière (revert_booking_cancellation_after_stripe_error,
  -- reactivate_prereservation) : on rend sa place à la réservation.
  ELSIF OLD.status IN ('cancelled', 'Annulé', 'noshow')
        AND NEW.status NOT IN ('cancelled', 'Annulé', 'noshow') THEN
    UPDATE public.amenity_bookings
    SET status = 'confirmed'
    WHERE linked_booking_id = NEW.id
      AND status IN ('cancelled', 'noshow');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.propagate_booking_status_to_amenities() IS
  'Aligne amenity_bookings.status sur bookings.status pour les lignes liées '
  '(linked_booking_id), afin qu''une annulation libère la capacité de l''amenity.';

DROP TRIGGER IF EXISTS trg_propagate_booking_status_to_amenities ON public.bookings;

CREATE TRIGGER trg_propagate_booking_status_to_amenities
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_booking_status_to_amenities();

-- Rattrapage des lignes déjà orphelines : bookings annulés dont l'amenity_booking
-- est resté 'confirmed' et bloque encore un créneau.
UPDATE public.amenity_bookings ab
SET status = CASE WHEN b.status = 'noshow' THEN 'noshow' ELSE 'cancelled' END
FROM public.bookings b
WHERE ab.linked_booking_id = b.id
  AND ab.status = 'confirmed'
  AND b.status IN ('cancelled', 'Annulé', 'noshow');
