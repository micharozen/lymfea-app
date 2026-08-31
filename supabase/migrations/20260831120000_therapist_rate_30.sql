-- Palier 30 minutes du barème thérapeute.
-- Les soins courts (gommage, add-on) tombaient sous le plus petit palier
-- configuré et étaient donc payés au pro-rata de celui-ci. Ce palier permet de
-- leur fixer un montant propre, comme les autres paliers optionnels ajoutés en
-- 20260723120000. Reste NULL par défaut : tant qu'il n'est pas renseigné, le
-- calcul est strictement l'ancien.

ALTER TABLE therapists ADD COLUMN IF NOT EXISTS rate_30 numeric DEFAULT NULL;

COMMENT ON COLUMN therapists.rate_30 IS 'Fixed therapist payout for a 30-minute treatment';
