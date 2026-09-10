-- L'équipe lieu (concierge) peut désormais éditer les infos client d'une
-- réservation (identité, téléphone, note client) depuis EditBookingDialog.
-- La fiche customers étant la source de vérité de ces informations, la synchro
-- échouait silencieusement : les concierges n'avaient que le SELECT.

CREATE POLICY "Concierges can update customers"
ON "public"."customers"
FOR UPDATE
USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"))
WITH CHECK ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));
