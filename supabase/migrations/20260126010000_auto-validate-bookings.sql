-- Add auto_validate_bookings column to hotels table
-- When enabled and only 1 hairdresser is assigned, bookings are automatically confirmed

ALTER TABLE hotels
ADD COLUMN IF NOT EXISTS auto_validate_bookings BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN hotels.auto_validate_bookings IS 'When true and only 1 active hairdresser is assigned to the venue, bookings are automatically confirmed without manual hairdresser validation';
