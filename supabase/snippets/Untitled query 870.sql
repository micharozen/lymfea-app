-- 1. Ajout de la colonne sécurisée pour le token
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS signature_token TEXT UNIQUE;

-- 2. Création d'un index pour accélérer les recherches
CREATE INDEX IF NOT EXISTS idx_bookings_signature_token
  ON bookings(signature_token)
  WHERE signature_token IS NOT NULL;

-- 3. Fonction (RPC) pour LIRE les infos (Version complète avec hotel_name)
CREATE OR REPLACE FUNCTION get_booking_by_signature_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  client_first_name TEXT,
  client_last_name TEXT,
  booking_date DATE,
  booking_time TIME,
  room_number TEXT,
  client_signature TEXT,
  signed_at TIMESTAMPTZ,
  hotel_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT b.id, b.client_first_name, b.client_last_name, b.booking_date, b.booking_time,
         b.room_number, b.client_signature, b.signed_at, b.hotel_name
  FROM bookings b
  WHERE b.signature_token = p_token
    AND b.status IN ('pending', 'confirmed', 'ongoing');
END;
$$;

-- 4. Fonction (RPC) pour SAUVEGARDER la signature
CREATE OR REPLACE FUNCTION submit_client_signature(
  p_token TEXT,
  p_signature TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bookings
  SET client_signature = p_signature,
      signed_at = NOW()
  WHERE signature_token = p_token
    AND signed_at IS NULL
    AND status IN ('pending', 'confirmed', 'ongoing');

  RETURN FOUND;
END;
$$;

-- 5. LES PERMISSIONS (Essentiel pour que ça marche sur le vrai site !)
GRANT EXECUTE ON FUNCTION get_booking_by_signature_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_client_signature(TEXT, TEXT) TO anon;

-- 6. Sécurité RLS (Pour autoriser la lecture par le client)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read bookings" ON bookings;
CREATE POLICY "Allow public read bookings" 
ON bookings FOR SELECT 
TO anon 
USING (signature_token IS NOT NULL);