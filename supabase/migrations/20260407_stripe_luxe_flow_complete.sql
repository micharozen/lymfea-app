-- =============================================================================
-- Migration : Système de Paiement Différé & Confirmation Dynamique
-- Date : 07 Avril 2026
-- Objectif : Supporter Stripe SetupIntent, sécuriser l'affichage client et 
--            harmoniser les statuts de réservation.
-- =============================================================================

-- 1. MODIFICATIONS DE LA TABLE "CUSTOMERS"
-- Ajout de l'identifiant Stripe pour lier un client à son profil de paiement
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;


-- 2. MODIFICATION DE LA TABLE "BOOKINGS"
-- Ajout de la colonne stripe_session_id (C'EST LA CORRECTION ICI 👇)
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS stripe_session_id text;

-- Mise à jour de la contrainte pour accepter les nouveaux statuts de paiement
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check 
CHECK (payment_status IN (
  'pending',          -- En attente
  'paid',             -- Payé (Stripe ou autre)
  'failed',           -- Échec de paiement
  'refunded',         -- Remboursé
  'charged_to_room',  -- Facturé sur la chambre (Hôtel)
  'card_saved',       -- Empreinte de carte récupérée (SetupIntent)
  'awaiting_payment'  -- Réservation validée, paiement à faire en fin de soin
));

-- Index pour accélérer la recherche lors du retour de Stripe (évite les doublons)
CREATE INDEX IF NOT EXISTS idx_bookings_stripe_session_id ON public.bookings(stripe_session_id);


-- 3. CRÉATION DE LA TABLE "BOOKING_PAYMENT_INFOS"
-- Stocke les métadonnées Stripe (SetupIntent, PaymentMethod) de manière isolée
CREATE TABLE IF NOT EXISTS public.booking_payment_infos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    stripe_payment_method_id text,
    stripe_setup_intent_id text,
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


-- 4. CRÉATION DE LA FONCTION RPC "GET_BOOKING_SUMMARY"
-- Permet au client de voir son récapitulatif LUXE sans accès direct aux tables (RLS)
CREATE OR REPLACE FUNCTION public.get_booking_summary(_booking_id UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER -- Crucial : contourne le RLS pour cette requête spécifique et sécurisée
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


-- 5. SÉCURISATION RLS ET PERMISSIONS

-- Sécurisation de la table des paiements (booking_payment_infos)
ALTER TABLE public.booking_payment_infos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role handles payment infos" ON public.booking_payment_infos;
CREATE POLICY "Service role handles payment infos" ON public.booking_payment_infos 
TO service_role USING (true) WITH CHECK (true);

-- Sécurisation de l'accès au résumé de réservation
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
GRANT EXECUTE ON FUNCTION public.get_booking_summary(UUID) TO anon, authenticated;

-- =============================================================================
-- 6. CORRECTIF : PERMISSIONS SUR LES SOINS DE LA RÉSERVATION
-- =============================================================================

-- On s'assure que le RLS est bien actif sur booking_treatments
ALTER TABLE public.booking_treatments ENABLE ROW LEVEL SECURITY;

-- On supprime l'ancienne règle si elle existe pour éviter les conflits
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.booking_treatments;

-- On autorise les utilisateurs connectés (thérapeutes/admins) à supprimer un soin d'une réservation
CREATE POLICY "Enable delete for authenticated users" 
ON public.booking_treatments 
FOR DELETE 
TO authenticated 
USING (true);