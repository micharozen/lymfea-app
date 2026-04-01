-- 1. Ajout de la colonne pour stocker tout le questionnaire
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS client_form_data JSONB;

-- 2. Mise à jour de la fonction RPC pour accepter le formulaire
CREATE OR REPLACE FUNCTION submit_client_signature(
  p_token TEXT,
  p_signature TEXT,
  p_form_data JSONB -- NOUVEAU : On reçoit les données du PDF
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE bookings
  SET client_signature = p_signature,
      client_form_data = p_form_data, -- NOUVEAU : On sauvegarde les réponses
      signed_at = NOW()
  WHERE signature_token = p_token
    AND signed_at IS NULL
    AND status IN ('pending', 'confirmed', 'ongoing');

  RETURN FOUND;
END;
$$;