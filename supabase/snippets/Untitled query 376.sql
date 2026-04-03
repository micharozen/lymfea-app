-- 1. Mise à jour de la fonction de récupération (GET)
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
        -- On va chercher les noms des soins dans treatment_menus via la table de liaison
        -- string_agg permet de les regrouper avec une virgule si le client a pris plusieurs soins !
        COALESCE(
            (
                SELECT string_agg(tm.name, ', ')
                FROM booking_treatments bt
                JOIN treatment_menus tm ON bt.treatment_id = tm.id
                WHERE bt.booking_id = b.id
            ), 
            'Soin sur mesure' -- Texte par défaut si aucun soin n'est lié
        ) AS treatment_name,
        b.total_price
    FROM bookings b
    WHERE b.signature_token = p_token
    AND b.signed_at IS NULL;
END;
$$;


-- 2. Mise à jour de la fonction de validation (SUBMIT) pour inclure les données du PDF
CREATE OR REPLACE FUNCTION submit_client_signature(
  p_token TEXT,
  p_signature TEXT,
  p_form_data JSONB -- On accepte toutes les réponses du client
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE bookings
  SET client_signature = p_signature,
      client_form_data = p_form_data, -- On range le formulaire ici
      signed_at = NOW()
  WHERE signature_token = p_token
    AND signed_at IS NULL  
    AND status IN ('pending', 'confirmed', 'ongoing'); 

  RETURN FOUND;
END;
$$;