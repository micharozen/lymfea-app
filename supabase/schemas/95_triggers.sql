CREATE OR REPLACE TRIGGER "hotels_autofill_slug_trigger" BEFORE INSERT ON "public"."hotels" FOR EACH ROW EXECUTE FUNCTION "public"."hotels_autofill_slug"();

CREATE OR REPLACE TRIGGER "on_booking_cancelled" AFTER UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_cancellation_notifications"();

CREATE OR REPLACE TRIGGER "sync_concierge_timezone" AFTER INSERT ON "public"."concierge_hotels" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_timezone_from_hotel"();

CREATE OR REPLACE TRIGGER "sync_hairdresser_timezone" AFTER INSERT ON "public"."therapist_venues" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_timezone_from_hotel"();

CREATE OR REPLACE TRIGGER "treatment_menus_autofill_slug_trigger" BEFORE INSERT ON "public"."treatment_menus" FOR EACH ROW EXECUTE FUNCTION "public"."treatment_menus_autofill_slug"();

CREATE OR REPLACE TRIGGER "trg_booking_audit" AFTER INSERT OR UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."log_booking_change"();

CREATE OR REPLACE TRIGGER "trg_prevent_overlapping_treatment_room_bookings" BEFORE INSERT OR UPDATE OF "hotel_id", "booking_date", "booking_time", "duration", "room_id", "secondary_room_id", "status", "payment_status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_overlapping_treatment_room_bookings"();

CREATE OR REPLACE TRIGGER "trg_therapist_availability_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."therapist_availability" FOR EACH ROW EXECUTE FUNCTION "public"."log_therapist_availability_change"();

CREATE OR REPLACE TRIGGER "trg_ticket_closed_at" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."set_ticket_closed_at"();

CREATE OR REPLACE TRIGGER "trigger_treatment_categories_updated_at" BEFORE UPDATE ON "public"."treatment_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_treatment_categories_updated_at"();

CREATE OR REPLACE TRIGGER "update_admins_updated_at" BEFORE UPDATE ON "public"."admins" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_amenity_bookings_updated_at" BEFORE UPDATE ON "public"."amenity_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_billing_profiles_updated_at" BEFORE UPDATE ON "public"."billing_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_concierges_updated_at" BEFORE UPDATE ON "public"."concierges" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_customer_treatment_bundles_updated_at" BEFORE UPDATE ON "public"."customer_treatment_bundles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_hairdresser_payouts_updated_at" BEFORE UPDATE ON "public"."therapist_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_hairdressers_updated_at" BEFORE UPDATE ON "public"."therapists" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_hotel_ledger_updated_at" BEFORE UPDATE ON "public"."hotel_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_hotels_updated_at" BEFORE UPDATE ON "public"."hotels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_push_subscriptions_updated_at" BEFORE UPDATE ON "public"."push_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_push_tokens_updated_at" BEFORE UPDATE ON "public"."push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_treatment_bundles_updated_at" BEFORE UPDATE ON "public"."treatment_bundles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_treatment_menus_updated_at" BEFORE UPDATE ON "public"."treatment_menus" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_venue_amenities_updated_at" BEFORE UPDATE ON "public"."venue_amenities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
