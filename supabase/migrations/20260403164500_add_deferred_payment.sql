-- ==============================================================================
-- Migration : add_deferred_payment
-- Description : Ajout de la table booking_payment_infos et maj de customers/bookings
-- Objectif : Supporter le paiement différé via Stripe SetupIntent (Ticket S1-06)
-- ==============================================================================

-- 1. Modification de la table "customers"
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

-- 2. Mise à jour de la contrainte des statuts sur la table "bookings"
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check 
CHECK (payment_status IN (
  'pending', 
  'paid', 
  'failed', 
  'refunded', 
  'charged_to_room',
  'card_saved'
));

-- 3. Création de la table "booking_payment_infos"
CREATE TABLE IF NOT EXISTS public.booking_payment_infos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES public.customers(id),
    stripe_payment_method_id text NOT NULL,
    stripe_setup_intent_id text NOT NULL,
    card_brand text, 
    card_last4 text, 
    estimated_price numeric(10,2),
    payment_status text CHECK (payment_status IN ('pending', 'charged', 'failed', 'requires_action', 'card_saved')) DEFAULT 'pending',
    payment_at timestamptz,
    stripe_payment_intent_id text,
    payment_error_message text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. Sécurisation (RLS)
ALTER TABLE public.booking_payment_infos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.booking_payment_infos;
CREATE POLICY "Enable all access for authenticated users" 
ON public.booking_payment_infos FOR ALL TO authenticated USING (true);