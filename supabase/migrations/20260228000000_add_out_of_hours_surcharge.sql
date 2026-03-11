-- Venue configuration: allow out-of-hours bookings with surcharge
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS allow_out_of_hours_booking boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_hours_surcharge_percent numeric DEFAULT 0;

-- Booking tracking: flag and surcharge amount
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_out_of_hours boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS surcharge_amount numeric DEFAULT 0;
