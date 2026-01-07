-- Add foreign key constraint to concierge_hotels with CASCADE delete
ALTER TABLE public.concierge_hotels
DROP CONSTRAINT IF EXISTS concierge_hotels_hotel_id_fkey;

ALTER TABLE public.concierge_hotels
ADD CONSTRAINT concierge_hotels_hotel_id_fkey
FOREIGN KEY (hotel_id) REFERENCES public.hotels(id) ON DELETE CASCADE;

-- Add CASCADE to hairdresser_hotels (it already has a FK but need to add CASCADE)
ALTER TABLE public.hairdresser_hotels
DROP CONSTRAINT IF EXISTS hairdresser_hotels_hotel_id_fkey;

ALTER TABLE public.hairdresser_hotels
ADD CONSTRAINT hairdresser_hotels_hotel_id_fkey
FOREIGN KEY (hotel_id) REFERENCES public.hotels(id) ON DELETE CASCADE;

-- Update bookings hotel_id to SET NULL on hotel delete (can't cascade bookings)
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_hotel_id_fkey;

-- Note: bookings.hotel_id is text type, hotels.id is text, so this should work
-- But we keep hotel_name in bookings for history, so SET NULL is appropriate

-- Update hotel_ledger to CASCADE delete
ALTER TABLE public.hotel_ledger
DROP CONSTRAINT IF EXISTS hotel_ledger_hotel_id_fkey;

ALTER TABLE public.hotel_ledger
ADD CONSTRAINT hotel_ledger_hotel_id_fkey
FOREIGN KEY (hotel_id) REFERENCES public.hotels(id) ON DELETE CASCADE;