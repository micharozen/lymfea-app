-- 1. On s'assure que la colonne a une valeur par défaut automatique
ALTER TABLE public.bookings 
ALTER COLUMN signature_token SET DEFAULT encode(gen_random_bytes(32), 'hex');

-- 2. On met à jour toutes les anciennes réservations (les fausses données) 
-- pour qu'elles aient aussi un token généré, sinon le bouton n'apparaîtra pas sur elles !
UPDATE public.bookings 
SET signature_token = encode(gen_random_bytes(32), 'hex') 
WHERE signature_token IS NULL;