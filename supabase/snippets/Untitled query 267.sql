-- 1. On force la catégorie du soin Détox à être exactement "Soin du corps"
UPDATE public.treatment_menus
SET category = 'Soin du corps'
WHERE name ILIKE '%detox%';

-- 2. On s'assure que tes praticiens de test ont exactement la compétence "Soin du corps"
UPDATE public.therapists
SET skills = array_append(array_remove(skills, 'Soins corps'), 'Soin du corps')
WHERE first_name IN ('Dev', 'Marc', 'Alice', 'Jean', 'Marie')
  AND NOT ('Soin du corps' = ANY(skills));