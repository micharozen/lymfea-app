-- Toggle sur le lieu : true = mode global (%), false = mode individuel (taux horaire par therapeute)
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS global_therapist_commission BOOLEAN DEFAULT true;

-- Taux horaire global par therapeute (en devise du lieu)
ALTER TABLE therapists
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(8,2) DEFAULT NULL;
