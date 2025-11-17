-- Create a sequence for booking_id starting at 1
CREATE SEQUENCE IF NOT EXISTS bookings_booking_id_seq START WITH 1 INCREMENT BY 1;

-- Add booking_id column to bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booking_id INTEGER DEFAULT nextval('bookings_booking_id_seq');

-- Set the booking_id for existing bookings based on their creation order
UPDATE public.bookings 
SET booking_id = subquery.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num
  FROM public.bookings
  WHERE booking_id IS NULL
) AS subquery
WHERE bookings.id = subquery.id;

-- Make booking_id NOT NULL after setting values
ALTER TABLE public.bookings ALTER COLUMN booking_id SET NOT NULL;

-- Create unique index on booking_id
CREATE UNIQUE INDEX IF NOT EXISTS bookings_booking_id_idx ON public.bookings(booking_id);