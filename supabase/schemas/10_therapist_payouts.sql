CREATE TABLE IF NOT EXISTS "public"."therapist_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT 'a0000000-0000-0000-0000-000000000001'::"uuid",
    "therapist_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "stripe_transfer_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hairdresser_payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);

ALTER TABLE "public"."therapist_payouts" OWNER TO "postgres";

ALTER TABLE ONLY "public"."therapist_payouts"
    ADD CONSTRAINT "hairdresser_payouts_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_hairdresser_payouts_booking_id" ON "public"."therapist_payouts" USING "btree" ("booking_id");

CREATE INDEX "idx_hairdresser_payouts_hairdresser_id" ON "public"."therapist_payouts" USING "btree" ("therapist_id");

CREATE INDEX "idx_hairdresser_payouts_status" ON "public"."therapist_payouts" USING "btree" ("status");

ALTER TABLE "public"."therapist_payouts" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."therapist_payouts" TO "anon";

GRANT ALL ON TABLE "public"."therapist_payouts" TO "authenticated";

GRANT ALL ON TABLE "public"."therapist_payouts" TO "service_role";
