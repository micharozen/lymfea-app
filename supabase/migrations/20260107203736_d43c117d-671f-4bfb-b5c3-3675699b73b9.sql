-- Add CASCADE delete for treatment_menus when hotel is deleted
ALTER TABLE public.treatment_menus
DROP CONSTRAINT IF EXISTS treatment_menus_hotel_id_fkey;

ALTER TABLE public.treatment_menus
ADD CONSTRAINT treatment_menus_hotel_id_fkey
FOREIGN KEY (hotel_id) REFERENCES public.hotels(id) ON DELETE SET NULL;

-- Add CASCADE for trunks.hotel_id
ALTER TABLE public.trunks
DROP CONSTRAINT IF EXISTS trunks_hotel_id_fkey;

ALTER TABLE public.trunks
ADD CONSTRAINT trunks_hotel_id_fkey
FOREIGN KEY (hotel_id) REFERENCES public.hotels(id) ON DELETE SET NULL;

-- Add CASCADE for treatment_requests.hotel_id
ALTER TABLE public.treatment_requests
DROP CONSTRAINT IF EXISTS treatment_requests_hotel_id_fkey;

ALTER TABLE public.treatment_requests
ADD CONSTRAINT treatment_requests_hotel_id_fkey
FOREIGN KEY (hotel_id) REFERENCES public.hotels(id) ON DELETE CASCADE;