-- =============================================================================
-- Migration : Ajout du support Alma (BNPL) dans booking_payment_infos
-- Date : 16 Avril 2026
-- =============================================================================

-- 1. Étendre booking_payment_infos avec les colonnes Alma
ALTER TABLE public.booking_payment_infos
  ADD COLUMN IF NOT EXISTS alma_payment_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS alma_installments_count smallint,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'stripe';

-- Ajouter la contrainte check pour provider
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_payment_infos_provider_check'
  ) THEN
    ALTER TABLE public.booking_payment_infos
      ADD CONSTRAINT booking_payment_infos_provider_check
      CHECK (provider IN ('stripe', 'alma'));
  END IF;
END $$;

-- Index pour lookup rapide par alma_payment_id (webhook IPN)
CREATE INDEX IF NOT EXISTS booking_payment_infos_alma_payment_id_idx
  ON public.booking_payment_infos(alma_payment_id)
  WHERE alma_payment_id IS NOT NULL;

-- 2. Étendre la contrainte payment_method de bookings pour inclure 'alma'
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IN ('room', 'card', 'tap_to_pay', 'offert', 'bundle', 'alma'));
