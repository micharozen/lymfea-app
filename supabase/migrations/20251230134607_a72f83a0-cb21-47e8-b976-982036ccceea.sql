-- Migration: Update booking status values to match real-world service lifecycle

-- 1. First, update existing 'assigned' bookings to 'confirmed'
UPDATE public.bookings 
SET status = 'confirmed' 
WHERE status = 'assigned';

-- 2. Update 'awaiting_validation' to 'completed' (or keep as pending based on context)
UPDATE public.bookings 
SET status = 'completed' 
WHERE status = 'awaiting_validation';

-- 3. Add comment to document the valid status values
COMMENT ON COLUMN public.bookings.status IS 'Valid values: pending, confirmed, ongoing, completed, cancelled, noshow';

-- 4. Update the default value (already 'pending', just confirming)
ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'pending';