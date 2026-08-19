-- Les gestionnaires de lieu (concierges) peuvent déclencher la génération de factures
-- depuis l'onglet Facturation (fiche thérapeute / fiche lieu) : l'edge function tourne en
-- service_role, la facture est donc bien créée. Mais la lecture de public.invoices était
-- réservée aux admins (et aux thérapeutes pour leurs propres factures) : le concierge
-- voyait une liste vide après génération.
-- On ouvre la lecture seule, strictement limitée aux lieux dont il a la charge.

CREATE POLICY "Concierges can view invoices for their hotels"
ON "public"."invoices"
FOR SELECT
TO "authenticated"
USING (
  "public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role")
  AND "hotel_id" IN (
    SELECT "get_concierge_hotels"."hotel_id"
    FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")
  )
);
