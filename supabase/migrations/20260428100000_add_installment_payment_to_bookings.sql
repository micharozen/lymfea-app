-- ==============================================================================
-- Migration : add_installment_payment_to_bookings
-- Description : Permet de signaler qu'une réservation est réglée en plusieurs
--   fois. Utilisé principalement pour les cures (treatment_menus.is_bundle =
--   true) où le client peut étaler le paiement sur plusieurs échéances.
--   - paid_in_installments : flag booléen indiquant un paiement échelonné
--   - installments_count   : nombre d'échéances (ex. 3 pour un 3x)
-- ==============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS paid_in_installments BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS installments_count INTEGER;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_installments_count_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_installments_count_check
  CHECK (
    (paid_in_installments = false AND installments_count IS NULL)
    OR (paid_in_installments = true AND installments_count IS NOT NULL AND installments_count >= 2)
  );

COMMENT ON COLUMN public.bookings.paid_in_installments IS
  'Indique si le client règle la réservation en plusieurs fois. Surtout pertinent pour les cures.';

COMMENT ON COLUMN public.bookings.installments_count IS
  'Nombre d''échéances de paiement (>= 2). NULL si paid_in_installments = false.';
