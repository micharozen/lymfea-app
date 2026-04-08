-- Add calendar_color column to hotels for planning view color coding
ALTER TABLE hotels ADD COLUMN calendar_color text DEFAULT '#3b82f6';
