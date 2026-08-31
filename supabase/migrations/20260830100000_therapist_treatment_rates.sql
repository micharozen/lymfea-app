-- Barèmes de rémunération spécifiques à certains soins, par thérapeute.
-- Un soin manucure ne rapporte pas la même chose qu'un massage : les paliers
-- rate_45…rate_150 restent le barème par défaut, ces barèmes-ci ne s'appliquent
-- qu'aux soins explicitement configurés. Cas rare, d'où le jsonb plutôt qu'une
-- table (même parti pris que minimum_guarantee juste au-dessus).

ALTER TABLE therapists
  ADD COLUMN IF NOT EXISTS treatment_rates jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS treatment_rates_active boolean DEFAULT false;

COMMENT ON COLUMN therapists.treatment_rates IS
  'Barèmes spécifiques par soin : { "<treatment_menu_id>": { "60": 45, "90": 62 } }. Clé de durée en minutes, valeur en euros. Ignoré tant que treatment_rates_active est false.';

COMMENT ON COLUMN therapists.treatment_rates_active IS
  'Active les barèmes de treatment_rates. Décocher les conserve sans les appliquer.';
