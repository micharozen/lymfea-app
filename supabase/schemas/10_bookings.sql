CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "hotel_name" "text",
    "client_first_name" "text" NOT NULL,
    "client_last_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "room_number" "text",
    "booking_date" "date" NOT NULL,
    "booking_time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "therapist_id" "uuid",
    "therapist_name" "text",
    "total_price" numeric DEFAULT 0.00,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_id" integer DEFAULT "nextval"('"public"."bookings_booking_id_seq"'::"regclass") NOT NULL,
    "client_signature" "text",
    "cancellation_reason" "text",
    "signed_at" timestamp with time zone,
    "assigned_at" timestamp with time zone,
    "declined_by" "uuid"[] DEFAULT '{}'::"uuid"[],
    "client_email" "text",
    "payment_method" "text" DEFAULT 'room'::"text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "client_note" "text",
    "stripe_invoice_url" "text",
    "quote_token" "text",
    "room_id" "uuid",
    "duration" integer,
    "payment_link_url" "text",
    "payment_link_sent_at" timestamp with time zone,
    "payment_link_channels" "text"[],
    "payment_link_language" "text",
    "payment_error_code" "text",
    "payment_error_message" "text",
    "payment_error_details" "jsonb",
    "pms_charge_status" "text",
    "pms_charge_id" "text",
    "pms_error_message" "text",
    "customer_id" "uuid",
    "is_out_of_hours" boolean DEFAULT false,
    "surcharge_amount" numeric DEFAULT 0,
    "pms_guest_check_in" timestamp with time zone,
    "pms_guest_check_out" timestamp with time zone,
    "signature_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text"),
    "client_form_data" "jsonb",
    "language" "text" DEFAULT 'fr'::"text",
    "bundle_usage_id" "uuid",
    "gift_amount_applied_cents" integer DEFAULT 0 NOT NULL,
    "guest_count" integer DEFAULT 1 NOT NULL,
    "therapist_checked_in_at" timestamp with time zone,
    "hold_expires_at" timestamp with time zone,
    "client_type" "text" DEFAULT 'external'::"text" NOT NULL,
    "payment_reference" "text",
    "therapist_gender_preference" "text",
    "external_reference" "text",
    "external_id" "text",
    CONSTRAINT "bookings_client_type_check" CHECK (("client_type" = ANY (ARRAY['hotel'::"text", 'staycation'::"text", 'classpass'::"text", 'external'::"text"]))),
    CONSTRAINT "bookings_gift_amount_applied_cents_check" CHECK (("gift_amount_applied_cents" >= 0)),
    CONSTRAINT "bookings_payment_link_language_check" CHECK (("payment_link_language" = ANY (ARRAY['fr'::"text", 'en'::"text"]))),
    CONSTRAINT "bookings_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['room'::"text", 'card'::"text", 'tap_to_pay'::"text", 'offert'::"text", 'gift_amount'::"text", 'voucher'::"text", 'partner_billed'::"text"]))),
    CONSTRAINT "bookings_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'awaiting_payment'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'charged'::"text", 'charged_to_room'::"text", 'card_saved'::"text", 'expired'::"text", 'pending_partner_billing'::"text", 'pending_room_charge'::"text"]))),
    CONSTRAINT "bookings_therapist_gender_preference_check" CHECK (("therapist_gender_preference" = ANY (ARRAY['female'::"text", 'male'::"text"])))
);

ALTER TABLE "public"."bookings" OWNER TO "postgres";

COMMENT ON COLUMN "public"."bookings"."status" IS 'Valid values: pending, confirmed, ongoing, completed, cancelled, noshow';

COMMENT ON COLUMN "public"."bookings"."declined_by" IS 'Array of hairdresser IDs who have declined or unassigned from this booking';

COMMENT ON COLUMN "public"."bookings"."payment_link_url" IS 'Stripe Payment Link URL sent to client';

COMMENT ON COLUMN "public"."bookings"."payment_link_sent_at" IS 'Timestamp when payment link was sent';

COMMENT ON COLUMN "public"."bookings"."payment_link_channels" IS 'Channels used to send link: email, whatsapp';

COMMENT ON COLUMN "public"."bookings"."payment_link_language" IS 'Language of the payment link message: fr or en';

COMMENT ON COLUMN "public"."bookings"."payment_error_code" IS 'Code d''erreur Stripe (card_declined, insufficient_funds, expired_card, etc.)';

COMMENT ON COLUMN "public"."bookings"."payment_error_message" IS 'Message d''erreur lisible par humain pour affichage dans l''UI';

COMMENT ON COLUMN "public"."bookings"."payment_error_details" IS 'Détails JSON de l''erreur: decline_code, network_decline_code, last4, brand, timestamp';

COMMENT ON COLUMN "public"."bookings"."customer_id" IS 'Reference to persistent customer profile. Denormalized client_* fields kept for backward compat.';

COMMENT ON COLUMN "public"."bookings"."bundle_usage_id" IS 'Reference to bundle session usage if this booking consumed a cure credit';

COMMENT ON COLUMN "public"."bookings"."gift_amount_applied_cents" IS 'Portion of the booking price paid via a gift_amount card redemption';

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_signature_token_key" UNIQUE ("signature_token");

CREATE UNIQUE INDEX "bookings_booking_id_idx" ON "public"."bookings" USING "btree" ("booking_id");

CREATE INDEX "idx_bookings_awaiting_payment" ON "public"."bookings" USING "btree" ("payment_status", "created_at") WHERE ("payment_status" = 'awaiting_payment'::"text");

CREATE INDEX "idx_bookings_bundle_usage" ON "public"."bookings" USING "btree" ("bundle_usage_id") WHERE ("bundle_usage_id" IS NOT NULL);

CREATE INDEX "idx_bookings_client_type_month" ON "public"."bookings" USING "btree" ("client_type", "booking_date") WHERE ("client_type" = ANY (ARRAY['hotel'::"text", 'staycation'::"text", 'classpass'::"text"]));

CREATE INDEX "idx_bookings_customer" ON "public"."bookings" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);

CREATE UNIQUE INDEX "bookings_external_id_per_hotel_uniq" ON "public"."bookings" USING "btree" ("hotel_id", "external_id") WHERE ("external_id" IS NOT NULL);

CREATE INDEX "idx_bookings_hold_expires_at" ON "public"."bookings" USING "btree" ("hold_expires_at") WHERE (("status" = 'awaiting_payment'::"text") AND ("hold_expires_at" IS NOT NULL));

CREATE INDEX "idx_bookings_hotel_date" ON "public"."bookings" USING "btree" ("hotel_id", "booking_date");

CREATE INDEX "idx_bookings_payment_failed" ON "public"."bookings" USING "btree" ("payment_status") WHERE ("payment_status" = 'failed'::"text");

CREATE INDEX "idx_bookings_payment_link_sent" ON "public"."bookings" USING "btree" ("payment_link_sent_at") WHERE ("payment_link_url" IS NOT NULL);

CREATE INDEX "idx_bookings_quote_token" ON "public"."bookings" USING "btree" ("quote_token") WHERE ("quote_token" IS NOT NULL);

CREATE INDEX "idx_bookings_room_id" ON "public"."bookings" USING "btree" ("room_id");

CREATE INDEX "idx_bookings_signature_token" ON "public"."bookings" USING "btree" ("signature_token") WHERE ("signature_token" IS NOT NULL);

ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."bookings" TO "anon";

GRANT ALL ON TABLE "public"."bookings" TO "authenticated";

GRANT ALL ON TABLE "public"."bookings" TO "service_role";
