-- Add sort_order column to treatment_menus table
ALTER TABLE treatment_menus 
ADD COLUMN sort_order integer DEFAULT 0;