CREATE TABLE IF NOT EXISTS "public"."booking_payment_infos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid",
    "customer_id" "uuid",
    "stripe_payment_method_id" "text",
    "stripe_setup_intent_id" "text",
    "stripe_session_id" "text",
    "card_brand" "text",
    "card_last4" "text",
    "estimated_price" numeric(10,2),
    "payment_status" "text" DEFAULT 'pending'::"text",
    "payment_at" timestamp with time zone,
    "stripe_payment_intent_id" "text",
    "payment_error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_link_stripe_id" "text",
    "payment_link_expires_at" timestamp with time zone,
    "payment_reminder_count" integer DEFAULT 0,
    "payment_last_reminder_at" timestamp with time zone,
    "cancellation_reason" "text",
    CONSTRAINT "booking_payment_infos_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'charged'::"text", 'failed'::"text", 'requires_action'::"text", 'card_saved'::"text"])))
);

ALTER TABLE "public"."booking_payment_infos" OWNER TO "postgres";

ALTER TABLE ONLY "public"."booking_payment_infos"
    ADD CONSTRAINT "booking_payment_infos_booking_id_key" UNIQUE ("booking_id");

ALTER TABLE ONLY "public"."booking_payment_infos"
    ADD CONSTRAINT "booking_payment_infos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."booking_payment_infos"
    ADD CONSTRAINT "booking_payment_infos_stripe_session_id_key" UNIQUE ("stripe_session_id");

ALTER TABLE "public"."booking_payment_infos" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."booking_payment_infos" TO "anon";

GRANT ALL ON TABLE "public"."booking_payment_infos" TO "authenticated";

GRANT ALL ON TABLE "public"."booking_payment_infos" TO "service_role";
