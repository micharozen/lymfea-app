-- Ajoute 'cure_fresha' à bookings.payment_method : cures vendues via Fresha,
-- proposées à la saisie manuelle uniquement pour le lieu EÏA (restriction côté
-- application, voir VENUE_SPECIFIC_PAYMENT_METHODS dans src/lib/paymentMethod.ts).

ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_method_check
CHECK (payment_method = ANY (ARRAY['room'::text, 'card'::text, 'card_on_site'::text, 'offert'::text, 'gift_amount'::text, 'voucher'::text, 'partner_billed'::text, 'cash'::text, 'cure_fresha'::text]));
