-- Rename buffer_time to lead_time in treatment_menus table
-- This field represents the minimum notice/lead time required before booking (in minutes)
ALTER TABLE public.treatment_menus RENAME COLUMN buffer_time TO lead_time;