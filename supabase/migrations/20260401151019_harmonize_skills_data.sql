-- ==============================================================================
-- Migration : harmonize_skills_data
-- Description : Nettoyage et harmonisation de la base de données existante.
-- Objectif : Aligner l'orthographe des catégories de Soins avec l'orthographe 
--            des compétences des Thérapeutes pour éviter les erreurs de matching 
--            lors de la réservation (ex: "Soins corps" vs "Soin du corps").
-- ==============================================================================

-- 1. Harmonisation des menus de soins (On fixe la norme sur le singulier + "du")
UPDATE public.treatment_menus 
SET category = 'Soin du corps' 
WHERE LOWER(TRIM(category)) IN ('soins corps', 'soin corps', 'enveloppement');

UPDATE public.treatment_menus 
SET category = 'Soin du visage' 
WHERE LOWER(TRIM(category)) IN ('soins visage', 'soin visage', 'facial');

-- 2. Harmonisation des compétences des thérapeutes (Mise à jour des tableaux/arrays)
-- Remplacement des variations pour le corps
UPDATE public.therapists 
SET skills = array_replace(skills, 'Soins corps', 'Soin du corps');

UPDATE public.therapists 
SET skills = array_replace(skills, 'Soin corps', 'Soin du corps');

-- Remplacement des variations pour le visage
UPDATE public.therapists 
SET skills = array_replace(skills, 'Soins visage', 'Soin du visage');

UPDATE public.therapists 
SET skills = array_replace(skills, 'Soin Visage', 'Soin du visage');