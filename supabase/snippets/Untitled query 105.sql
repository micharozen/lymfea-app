-- 1. On harmonise les catégories du menu (Pluriel -> Standard)
UPDATE public.treatment_menus 
SET category = 'Soin du corps' 
WHERE category = 'Soins corps';

UPDATE public.treatment_menus 
SET category = 'Soin du visage' 
WHERE category = 'Soins visage';

-- 2. On s'assure que les thérapeutes ont exactement ces termes dans leurs compétences
-- On remplace les anciennes variantes par les nouvelles dans leurs tableaux de skills
UPDATE public.therapists
SET skills = array_replace(skills, 'Soins corps', 'Soin du corps');

UPDATE public.therapists
SET skills = array_replace(skills, 'body_treatment', 'Soin du corps');

UPDATE public.therapists
SET skills = array_replace(skills, 'Soins visage', 'Soin du visage');

UPDATE public.therapists
SET skills = array_replace(skills, 'facial', 'Soin du visage');