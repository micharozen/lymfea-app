-- Migration: Let venue managers (concierges) manage their venue's blocked slots
-- Le planning expose désormais l'action « Bloquer une plage horaire » aux
-- concierges. Jusqu'ici `venue_blocked_slots` n'avait qu'une policy admin :
-- la lecture renvoyait une liste vide (les blocages existants restaient
-- invisibles dans le calendrier) et toute écriture partait en 42501.
--
-- La portée est toujours limitée aux lieux du concierge via get_concierge_hotels().
-- Policy PERMISSIVE : la policy RESTRICTIVE "Admin org isolation" laisse passer
-- les non-admins (admin_can_access_hotel() renvoie true hors rôle admin).

DROP POLICY IF EXISTS "Concierges can manage blocked slots of their hotels" ON public.venue_blocked_slots;
CREATE POLICY "Concierges can manage blocked slots of their hotels"
  ON public.venue_blocked_slots
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(auth.uid()))
  );
