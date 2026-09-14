-- Un panier repris hors du parcours client restait « abandonné » pour toujours.
--
-- Cas réel (intent 096375ec, 02/09) : soin à prix sur demande, la cliente laisse
-- sa demande, l'équipe crée la réservation côté admin 11 min plus tard (payée,
-- soin réalisé). mark_checkout_intent_converted n'est appelée que par
-- create-client-booking et confirmSetupIntent, qui seuls transportent le
-- checkoutIntentId : l'intent gardait converted_at NULL et la page Paniers
-- l'affichait « Abandonné · Jamais relancé », faussant aussi le taux de
-- conversion.
--
-- La relance, elle, était déjà correctement supprimée : send-checkout-intent-reminder
-- écarte tout intent dont le couple (customer_id, hotel_id) a une réservation
-- postérieure. On remonte cette même règle dans la base pour que le statut
-- affiché suive le garde-fou d'envoi, quelle que soit l'origine de la
-- réservation (admin, PWA, PMS…).
--
-- Fenêtre : 7 jours, soit MAX_AGE_DAYS de la fonction de relance. Au-delà,
-- l'intent n'aurait de toute façon plus été relancé, et une réservation sans
-- rapport ne doit pas se compter comme une conversion.

CREATE OR REPLACE FUNCTION public.close_checkout_intent_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- L'index unique partiel idx_checkout_intents_one_open_per_customer_hotel
  -- garantit au plus un intent ouvert par couple ; le ORDER BY ne sert qu'à
  -- rendre le choix déterministe si cet index venait à disparaître.
  UPDATE public.checkout_intents ci
  SET converted_at = NEW.created_at,
      booking_id   = NEW.id
  WHERE ci.id = (
    SELECT id
    FROM public.checkout_intents
    WHERE customer_id = NEW.customer_id
      AND hotel_id    = NEW.hotel_id
      AND converted_at IS NULL
      AND created_at <= NEW.created_at
      AND created_at >  NEW.created_at - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.close_checkout_intent_on_booking() FROM PUBLIC;

DROP TRIGGER IF EXISTS close_checkout_intent_on_booking ON public.bookings;

CREATE TRIGGER close_checkout_intent_on_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.close_checkout_intent_on_booking();

-- ─── Rattrapage des paniers déjà mal étiquetés ──────────────────────────────
-- Même règle appliquée à l'historique : première réservation postérieure à
-- l'intent, chez le même lieu, dans la fenêtre de 7 jours.
WITH matched AS (
  SELECT DISTINCT ON (ci.id)
    ci.id AS intent_id,
    b.id  AS booking_id,
    b.created_at
  FROM public.checkout_intents ci
  JOIN public.bookings b
    ON b.customer_id = ci.customer_id
   AND b.hotel_id    = ci.hotel_id
   AND b.created_at >= ci.created_at
   AND b.created_at <  ci.created_at + INTERVAL '7 days'
  WHERE ci.converted_at IS NULL
  ORDER BY ci.id, b.created_at ASC
)
UPDATE public.checkout_intents ci
SET converted_at = matched.created_at,
    booking_id   = matched.booking_id
FROM matched
WHERE ci.id = matched.intent_id;
