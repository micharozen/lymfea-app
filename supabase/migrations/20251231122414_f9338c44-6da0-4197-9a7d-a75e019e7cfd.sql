-- Add trunk_id column to bookings table
ALTER TABLE public.bookings
ADD COLUMN trunk_id uuid REFERENCES public.trunks(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX idx_bookings_trunk_id ON public.bookings(trunk_id);

-- Add index for faster availability checks by hotel and date
CREATE INDEX idx_bookings_hotel_date ON public.bookings(hotel_id, booking_date);