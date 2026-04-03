-- ==============================================================================
-- Migration : update_signature_form_and_rpc
-- Description : Ajout de la colonne JSONB pour le formulaire médical, 
--               mise à jour de la récupération (GET) et de la validation (SUBMIT)
--               avec extraction automatique du numéro de chambre.
-- ==============================================================================

-- 1. Ajout de la colonne pour stocker les données du formulaire interactif
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS client_form_data JSONB;


-- 2. Mise à jour de la fonction de récupération (GET)
-- On supprime l'ancienne version pour éviter les conflits de paramètres
DROP FUNCTION IF EXISTS get_booking_by_signature_token(TEXT);

CREATE OR REPLACE FUNCTION get_booking_by_signature_token(p_token TEXT)
RETURNS TABLE (
    client_first_name TEXT,
    client_last_name TEXT,
    hotel_name TEXT,
    treatment_name TEXT,
    total_price NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.client_first_name, 
        b.client_last_name, 
        b.hotel_name,
        -- Récupération dynamique des soins liés à la réservation
        COALESCE(
            (
                SELECT string_agg(tm.name, ', ')
                FROM booking_treatments bt
                JOIN treatment_menus tm ON bt.treatment_id = tm.id
                WHERE bt.booking_id = b.id
            ), 
            'Soin sur mesure'
        ) AS treatment_name,
        b.total_price
    FROM bookings b
    WHERE b.signature_token = p_token
    AND b.signed_at IS NULL;
END;
$$;


-- 3. Mise à jour de la fonction de soumission (SUBMIT)
-- On supprime l'ancienne version qui ne prenait que 2 paramètres
DROP FUNCTION IF EXISTS submit_client_signature(TEXT, TEXT);

CREATE OR REPLACE FUNCTION submit_client_signature(
  p_token TEXT,
  p_signature TEXT,
  p_form_data JSONB -- Nouveau paramètre
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE bookings
  SET client_signature = p_signature,
      client_form_data = p_form_data, -- Sauvegarde du JSON complet
      -- NOUVEAU : On extrait le numéro de chambre du JSON pour mettre à jour la vraie colonne
      room_number = COALESCE(NULLIF(p_form_data->>'room_number', ''), room_number),
      signed_at = NOW()
  WHERE signature_token = p_token
    AND signed_at IS NULL  
    AND status IN ('pending', 'confirmed', 'ongoing'); 

  RETURN FOUND;
END;
$$;