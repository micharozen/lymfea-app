-- Désactivation manuelle d'un lien de paiement (issue #557).
--
-- Quand une réservation n'a finalement plus à être réglée en ligne (carte
-- cadeau, prise en charge hôtel, autre mode), l'équipe désactive le lien : le
-- Payment Link Stripe passe inactive et `payment_link_expires_at` est vidé pour
-- couper les relances (send-payment-reminder) et l'annulation automatique
-- (check-expired-payment-links). La date de désactivation est conservée pour la
-- traçabilité — l'auteur est tracé dans audit_log.

ALTER TABLE "public"."booking_payment_infos"
ADD COLUMN IF NOT EXISTS "payment_link_cancelled_at" timestamp with time zone;

COMMENT ON COLUMN "public"."booking_payment_infos"."payment_link_cancelled_at"
IS 'Désactivation manuelle du lien de paiement par une équipe (NULL = lien jamais désactivé)';
