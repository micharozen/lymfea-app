-- Allow hairdressers to view pending bookings from their affiliated hotels
CREATE POLICY "Hairdressers can view pending bookings from their hotels"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'hairdresser'::app_role) 
  AND status = 'En attente'
  AND hairdresser_id IS NULL
  AND hotel_id IN (
    SELECT hh.hotel_id 
    FROM hairdresser_hotels hh
    WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
  )
);

-- Allow hairdressers to view treatments for pending bookings from their hotels
CREATE POLICY "Hairdressers can view treatments for pending bookings"
ON public.booking_treatments
FOR SELECT
TO authenticated
USING (
  booking_id IN (
    SELECT b.id
    FROM bookings b
    WHERE b.status = 'En attente'
      AND b.hairdresser_id IS NULL
      AND b.hotel_id IN (
        SELECT hh.hotel_id 
        FROM hairdresser_hotels hh
        WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
      )
  )
);