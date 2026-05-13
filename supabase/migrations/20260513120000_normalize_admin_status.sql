-- Normalize legacy admin status values to lowercase English convention.
-- "En attente" is preserved (still meaningful for not-yet-activated admins).
UPDATE public.admins
SET status = 'active'
WHERE status = 'Actif';
