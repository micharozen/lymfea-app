-- Rename table boxes to trunks
ALTER TABLE public.boxes RENAME TO trunks;

-- Rename columns within the trunks table to use trunk terminology
ALTER TABLE public.trunks RENAME COLUMN box_model TO trunk_model;
ALTER TABLE public.trunks RENAME COLUMN box_id TO trunk_id;

-- Rename the hairdressers.boxes column to trunks
ALTER TABLE public.hairdressers RENAME COLUMN boxes TO trunks;