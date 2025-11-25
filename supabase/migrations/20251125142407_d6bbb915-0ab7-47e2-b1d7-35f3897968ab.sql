-- Add client booking fields to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS client_email TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'room' CHECK (payment_method IN ('room', 'card')),
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'charged_to_room'));