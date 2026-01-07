-- Add duration column to bookings table for custom durations (e.g., "on request" services)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS duration integer;