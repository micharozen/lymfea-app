-- Add foreign key constraints for bookings table
-- This enables Supabase nested select syntax: hotels() and hairdressers()

-- Add foreign key constraint for hotel_id
ALTER TABLE bookings
  ADD CONSTRAINT bookings_hotel_id_fkey
  FOREIGN KEY (hotel_id) REFERENCES hotels(id);

-- Add foreign key constraint for hairdresser_id (allows NULL values)
ALTER TABLE bookings
  ADD CONSTRAINT bookings_hairdresser_id_fkey
  FOREIGN KEY (hairdresser_id) REFERENCES hairdressers(id);
