-- Allow concierges to manage payment config for hotels they're assigned to.
-- Mirrors existing concierge venue-scoped policies (uses get_concierge_hotels()).

CREATE POLICY "Concierges manage payment configs for their hotels"
  ON public.hotel_payment_configs
  FOR ALL
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  );
