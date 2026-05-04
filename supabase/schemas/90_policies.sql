CREATE POLICY "Admin and concierge can read analytics" ON "public"."client_analytics" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'concierge'::"public"."app_role"]))))));

CREATE POLICY "Admin can manage PMS configs" ON "public"."hotel_pms_configs" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can create admins" ON "public"."admins" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can create booking treatments" ON "public"."booking_treatments" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can create bookings" ON "public"."bookings" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can create concierge hotels" ON "public"."concierge_hotels" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can create concierges" ON "public"."concierges" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can create hotels" ON "public"."hotels" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can create treatment menus" ON "public"."treatment_menus" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can create treatment rooms" ON "public"."treatment_rooms" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete admins" ON "public"."admins" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete booking treatments" ON "public"."booking_treatments" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete bookings" ON "public"."bookings" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete concierge hotels" ON "public"."concierge_hotels" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete concierges" ON "public"."concierges" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete hairdressers" ON "public"."therapists" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete hotels" ON "public"."hotels" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete push notification logs" ON "public"."push_notification_logs" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete their own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))));

CREATE POLICY "Admins can delete treatment menus" ON "public"."treatment_menus" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete treatment rooms" ON "public"."treatment_rooms" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can delete venue deployment schedules" ON "public"."venue_deployment_schedules" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can insert hairdressers" ON "public"."therapists" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can insert push notification logs" ON "public"."push_notification_logs" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can insert roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can insert venue deployment schedules" ON "public"."venue_deployment_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage amenity bookings" ON "public"."amenity_bookings" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage amount usages" ON "public"."bundle_amount_usages" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage billing_profiles" ON "public"."billing_profiles" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage booking_therapists" ON "public"."booking_therapists" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage bundle items" ON "public"."treatment_bundle_items" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage bundle usages" ON "public"."bundle_session_usages" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage bundles" ON "public"."treatment_bundles" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage categories" ON "public"."treatment_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "Admins can manage customer bundles" ON "public"."customer_treatment_bundles" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage customers" ON "public"."customers" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage hairdresser hotels" ON "public"."therapist_venues" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage invoices" ON "public"."invoices" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage ledger" ON "public"."hotel_ledger" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage payouts" ON "public"."therapist_payouts" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage venue amenities" ON "public"."venue_amenities" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can manage venue blocked slots" ON "public"."venue_blocked_slots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update admins" ON "public"."admins" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update bookings" ON "public"."bookings" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update concierge hotels" ON "public"."concierge_hotels" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update concierges" ON "public"."concierges" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update hairdressers" ON "public"."therapists" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update hotels" ON "public"."hotels" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update roles" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update their own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))));

CREATE POLICY "Admins can update treatment menus" ON "public"."treatment_menus" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update treatment rooms" ON "public"."treatment_rooms" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can update venue deployment schedules" ON "public"."venue_deployment_schedules" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all admins" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all booking treatments" ON "public"."booking_treatments" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all bookings" ON "public"."bookings" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all concierge hotels" ON "public"."concierge_hotels" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all concierges" ON "public"."concierges" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all hotels" ON "public"."hotels" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all ratings" ON "public"."therapist_ratings" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all treatment menus" ON "public"."treatment_menus" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all treatment rooms" ON "public"."treatment_rooms" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view all venue deployment schedules" ON "public"."venue_deployment_schedules" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view hairdresser hotels" ON "public"."therapist_venues" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view hairdressers" ON "public"."therapists" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view push notification logs" ON "public"."push_notification_logs" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

CREATE POLICY "Admins can view their own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))));

CREATE POLICY "Allow anonymous inserts" ON "public"."client_analytics" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);

CREATE POLICY "Allow public read bookings" ON "public"."bookings" FOR SELECT TO "anon" USING (("signature_token" IS NOT NULL));

CREATE POLICY "Anyone can read active treatment variants" ON "public"."treatment_variants" FOR SELECT USING (("status" = 'active'::"text"));

CREATE POLICY "Authenticated users can insert proposed slots" ON "public"."booking_proposed_slots" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Authenticated users can manage treatment variants" ON "public"."treatment_variants" TO "authenticated" USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view proposed slots" ON "public"."booking_proposed_slots" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Block all user access to otp_rate_limits" ON "public"."otp_rate_limits" USING (false);

CREATE POLICY "Block anonymous access to admins" ON "public"."admins" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to amenity bookings" ON "public"."amenity_bookings" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to amount usages" ON "public"."bundle_amount_usages" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to billing_profiles" ON "public"."billing_profiles" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to bookings" ON "public"."bookings" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to bundle usages" ON "public"."bundle_session_usages" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to concierges" ON "public"."concierges" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to customer bundles" ON "public"."customer_treatment_bundles" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to customers" ON "public"."customers" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to hairdresser_payouts" ON "public"."therapist_payouts" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to hairdressers" ON "public"."therapists" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to hotel_ledger" ON "public"."hotel_ledger" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to invoices" ON "public"."invoices" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to notifications" ON "public"."notifications" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to profiles" ON "public"."profiles" USING (("auth"."uid"() IS NOT NULL));

CREATE POLICY "Block anonymous access to user_roles" ON "public"."user_roles" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous access to venue amenities" ON "public"."venue_amenities" AS RESTRICTIVE TO "anon" USING (false);

CREATE POLICY "Block anonymous select on hairdresser_ratings" ON "public"."therapist_ratings" AS RESTRICTIVE FOR SELECT TO "anon" USING (false);

CREATE POLICY "Block direct access to gift code attempts" ON "public"."gift_code_attempts" AS RESTRICTIVE FOR ALL TO "authenticated", "anon" USING (false);

CREATE POLICY "Concierges can create amenity bookings for their hotels" ON "public"."amenity_bookings" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can create booking treatments for their hotels" ON "public"."booking_treatments" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE ("b"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));

CREATE POLICY "Concierges can create bookings for their hotels" ON "public"."bookings" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can delete amenity bookings for their hotels" ON "public"."amenity_bookings" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can delete booking treatments from their hotels" ON "public"."booking_treatments" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE ("b"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));

CREATE POLICY "Concierges can delete bookings from their hotels" ON "public"."bookings" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can insert customer bundles" ON "public"."customer_treatment_bundles" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));

CREATE POLICY "Concierges can manage venue amenities for their hotels" ON "public"."venue_amenities" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can update amenity bookings for their hotels" ON "public"."amenity_bookings" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can update bookings from their hotels" ON "public"."bookings" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can update their own profile" ON "public"."concierges" FOR UPDATE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Concierges can view all admins" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));

CREATE POLICY "Concierges can view amenity bookings for their hotels" ON "public"."amenity_bookings" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can view amount usages" ON "public"."bundle_amount_usages" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));

CREATE POLICY "Concierges can view booking treatments from their hotels" ON "public"."booking_treatments" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE ("b"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));

CREATE POLICY "Concierges can view booking_therapists for their hotels" ON "public"."booking_therapists" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."concierge_hotels" "ch" ON (("ch"."hotel_id" = "b"."hotel_id")))
  WHERE (("b"."id" = "booking_therapists"."booking_id") AND ("ch"."concierge_id" = "auth"."uid"()))))));

CREATE POLICY "Concierges can view bookings from their hotels" ON "public"."bookings" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can view bundle usages" ON "public"."bundle_session_usages" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));

CREATE POLICY "Concierges can view bundles" ON "public"."treatment_bundles" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));

CREATE POLICY "Concierges can view concierges from their hotels" ON "public"."concierges" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "ch"."concierge_id"
   FROM "public"."concierge_hotels" "ch"
  WHERE ("ch"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));

CREATE POLICY "Concierges can view customer bundles" ON "public"."customer_treatment_bundles" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));

CREATE POLICY "Concierges can view customers" ON "public"."customers" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role"));

CREATE POLICY "Concierges can view hairdresser hotels from their hotels" ON "public"."therapist_venues" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can view hairdressers from their hotels" ON "public"."therapists" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "hh"."therapist_id" AS "hairdresser_id"
   FROM "public"."therapist_venues" "hh"
  WHERE ("hh"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));

CREATE POLICY "Concierges can view hairdressers from their hotels (read-only)" ON "public"."therapists" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "hh"."therapist_id" AS "hairdresser_id"
   FROM "public"."therapist_venues" "hh"
  WHERE ("hh"."hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
           FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))))));

CREATE POLICY "Concierges can view their hotel associations" ON "public"."concierge_hotels" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can view their hotels" ON "public"."hotels" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can view their own profile" ON "public"."concierges" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Concierges can view treatment menus from their hotels" ON "public"."treatment_menus" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND (("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))) OR ("hotel_id" IS NULL))));

CREATE POLICY "Concierges can view treatment menus from their hotels (read-onl" ON "public"."treatment_menus" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND (("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id"))) OR ("hotel_id" IS NULL))));

CREATE POLICY "Concierges can view treatment rooms from their hotels" ON "public"."treatment_rooms" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can view treatment rooms from their hotels (read-onl" ON "public"."treatment_rooms" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Concierges can view venue amenities for their hotels" ON "public"."venue_amenities" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'concierge'::"public"."app_role") AND ("hotel_id" IN ( SELECT "get_concierge_hotels"."hotel_id"
   FROM "public"."get_concierge_hotels"("auth"."uid"()) "get_concierge_hotels"("hotel_id")))));

CREATE POLICY "Customer can read own bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."auth_user_id" = "auth"."uid"()))));

CREATE POLICY "Customer can read own bundles" ON "public"."customer_treatment_bundles" FOR SELECT TO "authenticated" USING (("beneficiary_customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."auth_user_id" = "auth"."uid"()))));

CREATE POLICY "Customer can read own profile" ON "public"."customers" FOR SELECT TO "authenticated" USING (("auth_user_id" = "auth"."uid"()));

CREATE POLICY "Customer can update own profile" ON "public"."customers" FOR UPDATE TO "authenticated" USING (("auth_user_id" = "auth"."uid"())) WITH CHECK (("auth_user_id" = "auth"."uid"()));

CREATE POLICY "Customers can update their own profile" ON "public"."customers" FOR UPDATE USING ((("auth_user_id" IS NOT NULL) AND ("auth_user_id" = "auth"."uid"()))) WITH CHECK ((("auth_user_id" IS NOT NULL) AND ("auth_user_id" = "auth"."uid"())));

CREATE POLICY "Customers can view their own amount usages" ON "public"."bundle_amount_usages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."customer_treatment_bundles" "ctb"
     JOIN "public"."customers" "c" ON (("c"."id" = "ctb"."beneficiary_customer_id")))
  WHERE (("ctb"."id" = "bundle_amount_usages"."customer_bundle_id") AND ("c"."auth_user_id" = "auth"."uid"())))));

CREATE POLICY "Customers can view their own bundles" ON "public"."customer_treatment_bundles" FOR SELECT USING ((("beneficiary_customer_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_treatment_bundles"."beneficiary_customer_id") AND ("c"."auth_user_id" = "auth"."uid"()))))));

CREATE POLICY "Customers can view their own profile" ON "public"."customers" FOR SELECT USING ((("auth_user_id" IS NOT NULL) AND ("auth_user_id" = "auth"."uid"())));

CREATE POLICY "Enable read access for authenticated users" ON "public"."booking_payment_infos" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Hairdressers can create proposals" ON "public"."booking_alternative_proposals" FOR INSERT WITH CHECK (("hairdresser_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "Hairdressers can create their own profile" ON "public"."therapists" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Hairdressers can delete their own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" IN ( SELECT "therapists"."user_id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "Hairdressers can update their own bookings" ON "public"."bookings" FOR UPDATE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"())))) WITH CHECK ((("therapist_id" IS NULL) OR ("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"())))));

CREATE POLICY "Hairdressers can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("user_id" IN ( SELECT "therapists"."user_id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"())))) WITH CHECK (("user_id" IN ( SELECT "therapists"."user_id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "Hairdressers can update their own profile" ON "public"."therapists" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Hairdressers can view admins" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role"));

CREATE POLICY "Hairdressers can view proposed slots" ON "public"."booking_proposed_slots" FOR SELECT USING (("booking_id" IN ( SELECT "b"."id"
   FROM (("public"."bookings" "b"
     JOIN "public"."therapist_venues" "hh" ON (("b"."hotel_id" = "hh"."hotel_id")))
     JOIN "public"."therapists" "h" ON (("hh"."therapist_id" = "h"."id")))
  WHERE ("h"."user_id" = "auth"."uid"()))));

CREATE POLICY "Hairdressers can view their own bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "Hairdressers can view their own notifications" ON "public"."notifications" FOR SELECT USING (("user_id" IN ( SELECT "therapists"."user_id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "Hairdressers can view their own profile" ON "public"."therapists" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Hairdressers can view their proposals" ON "public"."booking_alternative_proposals" FOR SELECT USING (("hairdresser_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "Hairdressers can view treatments for their bookings" ON "public"."booking_treatments" FOR SELECT TO "authenticated" USING (("booking_id" IN ( SELECT "bookings"."id"
   FROM "public"."bookings"
  WHERE ("bookings"."therapist_id" IN ( SELECT "therapists"."id"
           FROM "public"."therapists"
          WHERE ("therapists"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Public can insert ratings with valid token" ON "public"."therapist_ratings" FOR INSERT WITH CHECK (("rating_token" IS NOT NULL));

CREATE POLICY "Public can read categories" ON "public"."treatment_categories" FOR SELECT USING (true);

CREATE POLICY "Public can update ratings once with valid token" ON "public"."therapist_ratings" FOR UPDATE USING ((("rating_token" IS NOT NULL) AND ("submitted_at" IS NULL))) WITH CHECK (("rating_token" IS NOT NULL));

CREATE POLICY "Public can view active bundles" ON "public"."treatment_bundles" FOR SELECT USING (("status" = 'active'::"text"));

CREATE POLICY "Public can view bundle items" ON "public"."treatment_bundle_items" FOR SELECT USING (true);

CREATE POLICY "Public can view venue deployment schedules" ON "public"."venue_deployment_schedules" FOR SELECT TO "anon" USING (true);

CREATE POLICY "Purchasers can view their sent gifts" ON "public"."customer_treatment_bundles" FOR SELECT USING ((("is_gift" = true) AND (EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_treatment_bundles"."customer_id") AND ("c"."auth_user_id" = "auth"."uid"()))))));

CREATE POLICY "Service role full access" ON "public"."booking_alternative_proposals" USING (("auth"."role"() = 'service_role'::"text"));

CREATE POLICY "Service role full access" ON "public"."booking_proposed_slots" USING (("auth"."role"() = 'service_role'::"text"));

CREATE POLICY "Service role full access on venue blocked slots" ON "public"."venue_blocked_slots" USING (("auth"."role"() = 'service_role'::"text"));

CREATE POLICY "Service role handles payment infos" ON "public"."booking_payment_infos" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "System can create notifications" ON "public"."notifications" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "notifications"."user_id") AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'therapist'::"public"."app_role"]))))));

CREATE POLICY "Therapist can delete treatment if assigned to booking" ON "public"."booking_treatments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."therapists" "t" ON (("t"."id" = "b"."therapist_id")))
  WHERE (("b"."id" = "booking_treatments"."booking_id") AND ("t"."user_id" = "auth"."uid"())))));

CREATE POLICY "Therapists can create bookings for their hotels" ON "public"."bookings" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND ("hotel_id" IN ( SELECT "tv"."hotel_id"
   FROM "public"."therapist_venues" "tv"
  WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))));

CREATE POLICY "Therapists can create treatments for pending bookings in thei" ON "public"."booking_treatments" FOR INSERT WITH CHECK (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."status" = ANY (ARRAY['pending'::"text", 'awaiting_hairdresser_selection'::"text"])) AND ("b"."therapist_id" IS NULL) AND ("b"."hotel_id" IN ( SELECT "tv"."hotel_id"
           FROM "public"."therapist_venues" "tv"
          WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))))));

CREATE POLICY "Therapists can create treatments for their own bookings" ON "public"."booking_treatments" FOR INSERT WITH CHECK (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."therapist_id" = "public"."get_therapist_id"("auth"."uid"())) AND ("b"."hotel_id" IN ( SELECT "tv"."hotel_id"
           FROM "public"."therapist_venues" "tv"
          WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))))));

CREATE POLICY "Therapists can delete treatments for pending bookings in thei" ON "public"."booking_treatments" FOR DELETE USING (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."status" = ANY (ARRAY['pending'::"text", 'awaiting_hairdresser_selection'::"text"])) AND ("b"."therapist_id" IS NULL) AND ("b"."hotel_id" IN ( SELECT "tv"."hotel_id"
           FROM "public"."therapist_venues" "tv"
          WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))))));

CREATE POLICY "Therapists can view amount usages" ON "public"."bundle_amount_usages" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role"));

CREATE POLICY "Therapists can view assignments for their bookings" ON "public"."booking_therapists" FOR SELECT TO "authenticated" USING ("public"."is_booking_participant"("booking_id", "public"."get_therapist_id"("auth"."uid"())));

CREATE POLICY "Therapists can view booking_therapists for awaiting bookings at" ON "public"."booking_therapists" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."therapist_venues" "tv" ON (("tv"."hotel_id" = "b"."hotel_id")))
  WHERE (("b"."id" = "booking_therapists"."booking_id") AND ("b"."status" = 'awaiting_hairdresser_selection'::"text") AND ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"())) AND (NOT ("public"."get_therapist_id"("auth"."uid"()) = ANY (COALESCE("b"."declined_by", ARRAY[]::"uuid"[]))))))));

CREATE POLICY "Therapists can view bookings they joined as secondary" ON "public"."bookings" FOR SELECT TO "authenticated" USING ("public"."is_booking_participant"("id", "public"."get_therapist_id"("auth"."uid"())));

CREATE POLICY "Therapists can view bundle usages" ON "public"."bundle_session_usages" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role"));

CREATE POLICY "Therapists can view concierge hotels from their hotels" ON "public"."concierge_hotels" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND ("hotel_id" IN ( SELECT "tv"."hotel_id"
   FROM "public"."therapist_venues" "tv"
  WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))));

CREATE POLICY "Therapists can view concierges from their hotels" ON "public"."concierges" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND ("id" IN ( SELECT "ch"."concierge_id"
   FROM "public"."concierge_hotels" "ch"
  WHERE ("ch"."hotel_id" IN ( SELECT "tv"."hotel_id"
           FROM "public"."therapist_venues" "tv"
          WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))))));

CREATE POLICY "Therapists can view customer bundles" ON "public"."customer_treatment_bundles" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role"));

CREATE POLICY "Therapists can view customers" ON "public"."customers" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role"));

CREATE POLICY "Therapists can view hotels from their bookings" ON "public"."hotels" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND ("id" IN ( SELECT DISTINCT "b"."hotel_id"
   FROM "public"."bookings" "b"
  WHERE ("b"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))));

CREATE POLICY "Therapists can view own billing_profile" ON "public"."billing_profiles" FOR SELECT USING ((("owner_type" = 'therapist'::"text") AND ("owner_id" = ( SELECT ("therapists"."id")::"text" AS "id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"())))));

CREATE POLICY "Therapists can view own invoices" ON "public"."invoices" FOR SELECT USING (("therapist_id" = ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "Therapists can view pending bookings from their hotels" ON "public"."bookings" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND ("status" = ANY (ARRAY['pending'::"text", 'awaiting_hairdresser_selection'::"text"])) AND (("therapist_id" IS NULL) OR (("status" = 'awaiting_hairdresser_selection'::"text") AND ("guest_count" > 1))) AND ("hotel_id" IN ( SELECT "tv"."hotel_id"
   FROM "public"."therapist_venues" "tv"
  WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"())))) AND (NOT ("public"."get_therapist_id"("auth"."uid"()) = ANY (COALESCE("declined_by", ARRAY[]::"uuid"[]))))));

CREATE POLICY "Therapists can view their own hotel associations" ON "public"."therapist_venues" FOR SELECT TO "authenticated" USING (("therapist_id" = "public"."get_therapist_id"("auth"."uid"())));

CREATE POLICY "Therapists can view their own ratings" ON "public"."therapist_ratings" FOR SELECT USING (("therapist_id" = "public"."get_therapist_id"("auth"."uid"())));

CREATE POLICY "Therapists can view their payouts" ON "public"."therapist_payouts" FOR SELECT USING (("therapist_id" = "public"."get_therapist_id"("auth"."uid"())));

CREATE POLICY "Therapists can view treatment menus from their hotels" ON "public"."treatment_menus" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'therapist'::"public"."app_role") AND (("hotel_id" IN ( SELECT "tv"."hotel_id"
   FROM "public"."therapist_venues" "tv"
  WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"())))) OR ("hotel_id" IS NULL))));

CREATE POLICY "Therapists can view treatments for pending bookings" ON "public"."booking_treatments" FOR SELECT USING (("booking_id" IN ( SELECT "b"."id"
   FROM "public"."bookings" "b"
  WHERE (("b"."status" = ANY (ARRAY['pending'::"text", 'awaiting_hairdresser_selection'::"text"])) AND (("b"."therapist_id" IS NULL) OR (("b"."status" = 'awaiting_hairdresser_selection'::"text") AND ("b"."guest_count" > 1))) AND ("b"."hotel_id" IN ( SELECT "tv"."hotel_id"
           FROM "public"."therapist_venues" "tv"
          WHERE ("tv"."therapist_id" = "public"."get_therapist_id"("auth"."uid"()))))))));

CREATE POLICY "Users can delete their own push subscriptions" ON "public"."push_subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can delete their own push tokens" ON "public"."push_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert their own push subscriptions" ON "public"."push_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert their own push tokens" ON "public"."push_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update their own push subscriptions" ON "public"."push_subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update their own push tokens" ON "public"."push_tokens" FOR UPDATE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view their own push subscriptions" ON "public"."push_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view their own push tokens" ON "public"."push_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));

CREATE POLICY "admin_all_absences" ON "public"."therapist_absences" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "admin_all_availability" ON "public"."therapist_availability" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "admin_all_templates" ON "public"."therapist_schedule_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "admin_read_audit_log" ON "public"."audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "admin_update_audit_log" ON "public"."audit_log" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "admins_select_all_tickets" ON "public"."tickets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "admins_update_tickets" ON "public"."tickets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "authenticated_insert_tickets" ON "public"."tickets" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));

CREATE POLICY "staff_delete_own_booking_notes" ON "public"."booking_notes" FOR DELETE USING (("user_id" = "auth"."uid"()));

CREATE POLICY "staff_insert_booking_notes" ON "public"."booking_notes" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'concierge'::"public"."app_role"])))))));

CREATE POLICY "staff_read_booking_notes" ON "public"."booking_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'concierge'::"public"."app_role"]))))));

CREATE POLICY "therapist_booking_audit_log" ON "public"."audit_log" FOR SELECT USING ((("table_name" = 'bookings'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."therapists" "t" ON (("t"."id" = "b"."therapist_id")))
  WHERE ((("b"."id")::"text" = "audit_log"."record_id") AND ("t"."user_id" = "auth"."uid"()))))));

CREATE POLICY "therapist_own_absences_delete" ON "public"."therapist_absences" FOR DELETE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "therapist_own_absences_insert" ON "public"."therapist_absences" FOR INSERT WITH CHECK (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "therapist_own_absences_select" ON "public"."therapist_absences" FOR SELECT USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "therapist_own_absences_update" ON "public"."therapist_absences" FOR UPDATE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "therapist_own_audit_log" ON "public"."audit_log" FOR SELECT USING ((("table_name" = 'therapist_availability'::"text") AND (("metadata" ->> 'therapist_id'::"text") IN ( SELECT ("therapists"."id")::"text" AS "id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"())))));

CREATE POLICY "therapist_own_availability_delete" ON "public"."therapist_availability" FOR DELETE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "therapist_own_availability_insert" ON "public"."therapist_availability" FOR INSERT WITH CHECK (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "therapist_own_availability_select" ON "public"."therapist_availability" FOR SELECT USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "therapist_own_availability_update" ON "public"."therapist_availability" FOR UPDATE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "therapist_own_template_insert" ON "public"."therapist_schedule_templates" FOR INSERT WITH CHECK (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "therapist_own_template_select" ON "public"."therapist_schedule_templates" FOR SELECT USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "therapist_own_template_update" ON "public"."therapist_schedule_templates" FOR UPDATE USING (("therapist_id" IN ( SELECT "therapists"."id"
   FROM "public"."therapists"
  WHERE ("therapists"."user_id" = "auth"."uid"()))));

CREATE POLICY "treatment_addons_admin_write" ON "public"."treatment_addons" USING ((EXISTS ( SELECT 1
   FROM "public"."treatment_menus" "tm"
  WHERE (("tm"."id" = "treatment_addons"."parent_treatment_id") AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."treatment_menus" "tm"
  WHERE (("tm"."id" = "treatment_addons"."parent_treatment_id") AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")))));

CREATE POLICY "treatment_addons_public_read" ON "public"."treatment_addons" FOR SELECT USING (true);

CREATE POLICY "users_select_own_tickets" ON "public"."tickets" FOR SELECT USING (("created_by" = "auth"."uid"()));
