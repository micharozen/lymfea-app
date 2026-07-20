-- Clarifie la nomenclature de bookings.payment_method autour du LIEU d'encaissement :
--   card         = encaissé en ligne via Stripe (lien de paiement, tunnel client, PWA)
--   card_on_site = carte présentée sur place (Tap to Pay / terminal) — reste du Stripe
--   cash         = espèces sur place
--
-- Deux changements :
--   1. 'tap_to_pay' -> 'card_on_site' (renommage, même sémantique)
--   2. 'stripe' supprimé : doublon manuel de 'card' introduit par
--      20260716120000, écrit par aucun code applicatif. Les lignes saisies à la
--      main depuis l'admin sont repliées sur 'card'.

-- La contrainte doit tomber avant les UPDATE : les nouvelles valeurs n'y sont pas encore.
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

UPDATE bookings SET payment_method = 'card_on_site' WHERE payment_method = 'tap_to_pay';
UPDATE bookings SET payment_method = 'card' WHERE payment_method = 'stripe';

ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_method_check
CHECK (payment_method = ANY (ARRAY['room'::text, 'card'::text, 'card_on_site'::text, 'offert'::text, 'gift_amount'::text, 'voucher'::text, 'partner_billed'::text, 'cash'::text]));
