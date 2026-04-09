-- =============================================================================
-- Migration Unifiée : Architecture Paiement Stripe & Correctifs Sécurité
-- Date : 09 Avril 2026
-- =============================================================================

-- 1. CUSTOMERS : Ajout de l'identifiant Stripe
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

-- 2. CRÉATION DE LA TABLE DES PAIEMENTS
CREATE TABLE IF NOT EXISTS public.booking_payment_infos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    stripe_payment_method_id text,
    stripe_setup_intent_id text,
    stripe_session_id text UNIQUE, 
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

-- On s'assure de nettoyer la table bookings SI JAMAIS la colonne avait été créée
-- (Utilisation d'un bloc DO pour éviter l'erreur si la colonne n'existe pas lors d'un reset)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'stripe_session_id') THEN
        ALTER TABLE public.bookings DROP COLUMN stripe_session_id;
    END IF;
END $$;

DROP INDEX IF EXISTS public.idx_bookings_stripe_session_id;

-- 3. BOOKINGS : Retour à la contrainte stricte (Point 8)
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check 
CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'charged_to_room'));

-- 4. RLS : Sécurisation totale de la table paiement (Point 2)
ALTER TABLE public.booking_payment_infos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.booking_payment_infos;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.booking_payment_infos;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.booking_payment_infos;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.booking_payment_infos;
DROP POLICY IF EXISTS "Service role handles payment infos" ON public.booking_payment_infos;
-- NOUVEAU : On s'assure de drop la policy de lecture si elle existe déjà pour éviter les conflits
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.booking_payment_infos;

-- On donne tous les droits au serveur (Backend)
CREATE POLICY "Service role handles payment infos" ON public.booking_payment_infos 
TO service_role USING (true) WITH CHECK (true);

-- NOUVEAU : On donne juste le droit de LECTURE aux utilisateurs connectés (Thérapeutes/Admins)
CREATE POLICY "Enable read access for authenticated users" 
ON public.booking_payment_infos 
FOR SELECT 
TO authenticated 
USING (true);

-- 5. RLS : Sécurisation de la suppression des soins (Point 5)
ALTER TABLE public.booking_treatments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.booking_treatments;
DROP POLICY IF EXISTS "Therapist can delete treatment if assigned to booking" ON public.booking_treatments;

CREATE POLICY "Therapist can delete treatment if assigned to booking" 
ON public.booking_treatments 
FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.therapists t ON t.id = b.therapist_id
    WHERE b.id = booking_treatments.booking_id 
    AND t.user_id = auth.uid()
  )
);

-- 6. RPC : Recréation et sécurisation de get_booking_summary (Point 6)
CREATE OR REPLACE FUNCTION public.get_booking_summary(_booking_id UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id', b.id,
    'booking_date', b.booking_date,
    'booking_time', b.booking_time,
    'room_number', b.room_number,
    'hotels', (SELECT json_build_object('name', name) FROM hotels WHERE id = b.hotel_id),
    'treatments', COALESCE(
      (
        SELECT json_agg(tm.name)
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ),
      '[]'::json
    )
  )
  FROM bookings b
  WHERE b.id = _booking_id;
$$;

-- On révoque l'accès public et on l'accorde uniquement aux connectés
REVOKE EXECUTE ON FUNCTION public.get_booking_summary(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_booking_summary(UUID) TO authenticated;