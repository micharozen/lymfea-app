ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_linked_booking_id_fkey" FOREIGN KEY ("linked_booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_venue_amenity_id_fkey" FOREIGN KEY ("venue_amenity_id") REFERENCES "public"."venue_amenities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "booking_alternative_proposals_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "booking_alternative_proposals_hairdresser_id_fkey" FOREIGN KEY ("hairdresser_id") REFERENCES "public"."therapists"("id");

ALTER TABLE ONLY "public"."booking_notes"
    ADD CONSTRAINT "booking_notes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."booking_notes"
    ADD CONSTRAINT "booking_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."booking_payment_infos"
    ADD CONSTRAINT "booking_payment_infos_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."booking_payment_infos"
    ADD CONSTRAINT "booking_payment_infos_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."booking_proposed_slots"
    ADD CONSTRAINT "booking_proposed_slots_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."booking_proposed_slots"
    ADD CONSTRAINT "booking_proposed_slots_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."therapists"("id");

ALTER TABLE ONLY "public"."booking_therapists"
    ADD CONSTRAINT "booking_therapists_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."treatment_variants"("id");

ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id");

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_bundle_usage_id_fkey" FOREIGN KEY ("bundle_usage_id") REFERENCES "public"."bundle_session_usages"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_hairdresser_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id");

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id");

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_trunk_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."treatment_rooms"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."bundle_amount_usages"
    ADD CONSTRAINT "bundle_amount_usages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."bundle_amount_usages"
    ADD CONSTRAINT "bundle_amount_usages_customer_bundle_id_fkey" FOREIGN KEY ("customer_bundle_id") REFERENCES "public"."customer_treatment_bundles"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."bundle_session_usages"
    ADD CONSTRAINT "bundle_session_usages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."bundle_session_usages"
    ADD CONSTRAINT "bundle_session_usages_customer_bundle_id_fkey" FOREIGN KEY ("customer_bundle_id") REFERENCES "public"."customer_treatment_bundles"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."bundle_session_usages"
    ADD CONSTRAINT "bundle_session_usages_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."client_analytics"
    ADD CONSTRAINT "client_analytics_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."concierge_hotels"
    ADD CONSTRAINT "concierge_hotels_concierge_id_fkey" FOREIGN KEY ("concierge_id") REFERENCES "public"."concierges"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."concierge_hotels"
    ADD CONSTRAINT "concierge_hotels_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."concierges"
    ADD CONSTRAINT "concierges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_beneficiary_customer_id_fkey" FOREIGN KEY ("beneficiary_customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");

ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."treatment_bundles"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_preferred_therapist_id_fkey" FOREIGN KEY ("preferred_therapist_id") REFERENCES "public"."therapists"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "fk_booking" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."therapist_venues"
    ADD CONSTRAINT "hairdresser_hotels_hairdresser_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."therapist_venues"
    ADD CONSTRAINT "hairdresser_hotels_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."therapist_payouts"
    ADD CONSTRAINT "hairdresser_payouts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."therapist_payouts"
    ADD CONSTRAINT "hairdresser_payouts_hairdresser_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."therapist_ratings"
    ADD CONSTRAINT "hairdresser_ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."therapist_ratings"
    ADD CONSTRAINT "hairdresser_ratings_hairdresser_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."hotel_ledger"
    ADD CONSTRAINT "hotel_ledger_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."hotel_ledger"
    ADD CONSTRAINT "hotel_ledger_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."hotel_pms_configs"
    ADD CONSTRAINT "hotel_pms_configs_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."therapist_absences"
    ADD CONSTRAINT "therapist_absences_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."therapist_availability"
    ADD CONSTRAINT "therapist_availability_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."therapist_schedule_templates"
    ADD CONSTRAINT "therapist_schedule_templates_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."treatment_addons"
    ADD CONSTRAINT "treatment_addons_addon_treatment_id_fkey" FOREIGN KEY ("addon_treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."treatment_addons"
    ADD CONSTRAINT "treatment_addons_parent_treatment_id_fkey" FOREIGN KEY ("parent_treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."treatment_bundle_items"
    ADD CONSTRAINT "treatment_bundle_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."treatment_bundles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."treatment_bundle_items"
    ADD CONSTRAINT "treatment_bundle_items_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."treatment_bundles"
    ADD CONSTRAINT "treatment_bundles_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."treatment_menus"
    ADD CONSTRAINT "treatment_menus_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."treatment_bundles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."treatment_menus"
    ADD CONSTRAINT "treatment_menus_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."treatment_variants"
    ADD CONSTRAINT "treatment_variants_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment_menus"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."treatment_rooms"
    ADD CONSTRAINT "trunks_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."venue_amenities"
    ADD CONSTRAINT "venue_amenities_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."venue_blocked_slots"
    ADD CONSTRAINT "venue_blocked_slots_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."venue_deployment_schedules"
    ADD CONSTRAINT "venue_deployment_schedules_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE CASCADE;
