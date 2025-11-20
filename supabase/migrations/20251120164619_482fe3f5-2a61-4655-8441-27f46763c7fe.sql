-- Allow hairdressers to view concierges from hotels they work with
CREATE POLICY "Hairdressers can view concierges from their hotels"
ON public.concierges
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'hairdresser') AND
  id IN (
    SELECT ch.concierge_id
    FROM concierge_hotels ch
    WHERE ch.hotel_id IN (
      SELECT hh.hotel_id
      FROM hairdresser_hotels hh
      WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
    )
  )
);

-- Allow hairdressers to view concierge_hotels associations for their hotels
CREATE POLICY "Hairdressers can view concierge hotels from their hotels"
ON public.concierge_hotels
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'hairdresser') AND
  hotel_id IN (
    SELECT hh.hotel_id
    FROM hairdresser_hotels hh
    WHERE hh.hairdresser_id = get_hairdresser_id(auth.uid())
  )
);