-- Supprime therapists.trunks, colonne en écriture seule.
--
-- La colonne stockait une liste d'UUID de salles séparés par ", " dans un text,
-- saisie depuis les fiches thérapeute. Aucun moteur ne la lisait :
-- reserve_trunk_atomically alloue les salles par capacité et chevauchement
-- (treatment_rooms, secondary_room_id, buffers), sans jamais consulter la salle
-- « associée » au thérapeute. Seuls deux écrans admin l'affichaient.
--
-- Contrairement à therapists.skills (conservé jusqu'à la Release 2 du matching
-- par prestations), trunks n'a aucun consommateur : pas de transition à prévoir.
--
-- Défauts de conception au passage : chaîne d'IDs parsée à la main dans chaque
-- écran, et portée globale au thérapeute alors que les salles appartiennent à
-- un lieu — une liste plate mélangeait les salles de tous ses lieux.

ALTER TABLE public.therapists DROP COLUMN IF EXISTS trunks;
