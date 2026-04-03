DROP FUNCTION IF EXISTS submit_client_signature(TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION submit_client_signature(
  p_token TEXT,
  p_signature TEXT,
  p_form_data JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE bookings
  SET client_signature = p_signature,
      client_form_data = p_form_data,
      -- LA MAGIE EST ICI : On extrait le numéro de chambre du JSON
      -- (Si le client a écrit quelque chose, on le sauvegarde dans la vraie colonne)
      room_number = COALESCE(NULLIF(p_form_data->>'room_number', ''), room_number),
      signed_at = NOW()
  WHERE signature_token = p_token
    AND signed_at IS NULL  
    AND status IN ('pending', 'confirmed', 'ongoing'); 

  RETURN FOUND;
END;
$$;