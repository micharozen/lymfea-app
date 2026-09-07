CREATE TABLE IF NOT EXISTS "public"."voucher_verification_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "submitted_code" "text" NOT NULL,
    "submitted_code_normalized" "text" NOT NULL,
    "claimed_reseller_id" "uuid",
    "booking_total_cents" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resolved_bundle_id" "uuid",
    "approved_amount_cents" integer,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_vvr_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "chk_vvr_total_positive" CHECK (("booking_total_cents" >= 0)),
    CONSTRAINT "chk_vvr_resolution" CHECK (((("status" = 'pending'::"text")) OR (("status" = 'approved'::"text") AND ("reviewed_at" IS NOT NULL) AND ("approved_amount_cents" IS NOT NULL)) OR (("status" = ANY (ARRAY['rejected'::"text", 'cancelled'::"text"])) AND ("reviewed_at" IS NOT NULL))))
);

ALTER TABLE "public"."voucher_verification_requests" OWNER TO "postgres";

COMMENT ON TABLE "public"."voucher_verification_requests" IS 'File des références de bons saisies par un client mais introuvables en base : le lieu vérifie et tranche.';

COMMENT ON COLUMN "public"."voucher_verification_requests"."booking_total_cents" IS 'Total de la réservation figé au moment de la demande, pour que la validation ne dépende pas d''un prix modifié depuis.';

ALTER TABLE ONLY "public"."voucher_verification_requests"
    ADD CONSTRAINT "voucher_verification_requests_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "uq_vvr_pending_per_booking" ON "public"."voucher_verification_requests" USING "btree" ("booking_id") WHERE ("status" = 'pending'::"text");

CREATE INDEX "idx_vvr_hotel_pending" ON "public"."voucher_verification_requests" USING "btree" ("hotel_id", "created_at" DESC) WHERE ("status" = 'pending'::"text");

ALTER TABLE "public"."voucher_verification_requests" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."voucher_verification_requests" TO "anon";

GRANT ALL ON TABLE "public"."voucher_verification_requests" TO "authenticated";

GRANT ALL ON TABLE "public"."voucher_verification_requests" TO "service_role";
