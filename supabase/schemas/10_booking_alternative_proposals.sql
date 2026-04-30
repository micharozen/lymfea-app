CREATE TABLE IF NOT EXISTS "public"."booking_alternative_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "hairdresser_id" "uuid" NOT NULL,
    "original_date" "date" NOT NULL,
    "original_time" time without time zone NOT NULL,
    "alternative_1_date" "date" NOT NULL,
    "alternative_1_time" time without time zone NOT NULL,
    "alternative_2_date" "date" NOT NULL,
    "alternative_2_time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "current_offer_index" integer DEFAULT 1,
    "whatsapp_message_id" "text",
    "client_phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    CONSTRAINT "booking_alternative_proposals_current_offer_index_check" CHECK (("current_offer_index" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "booking_alternative_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'slot1_offered'::"text", 'slot1_accepted'::"text", 'slot1_rejected'::"text", 'slot2_offered'::"text", 'slot2_accepted'::"text", 'all_rejected'::"text", 'expired'::"text"])))
);

ALTER TABLE "public"."booking_alternative_proposals" OWNER TO "postgres";

COMMENT ON TABLE "public"."booking_alternative_proposals" IS 'Tracks hairdresser-proposed alternative time slots for bookings when they cannot accept the original time';

COMMENT ON COLUMN "public"."booking_alternative_proposals"."status" IS 'Flow state: pending -> slot1_offered -> (slot1_accepted | slot1_rejected -> slot2_offered -> (slot2_accepted | all_rejected)) | expired';

COMMENT ON COLUMN "public"."booking_alternative_proposals"."current_offer_index" IS '1 = first alternative being offered, 2 = second alternative being offered';

ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "booking_alternative_proposals_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."booking_alternative_proposals"
    ADD CONSTRAINT "unique_active_proposal_per_booking" UNIQUE ("booking_id");

CREATE INDEX "idx_proposals_booking_id" ON "public"."booking_alternative_proposals" USING "btree" ("booking_id");

CREATE INDEX "idx_proposals_client_phone" ON "public"."booking_alternative_proposals" USING "btree" ("client_phone");

CREATE INDEX "idx_proposals_hairdresser_id" ON "public"."booking_alternative_proposals" USING "btree" ("hairdresser_id");

CREATE INDEX "idx_proposals_status" ON "public"."booking_alternative_proposals" USING "btree" ("status") WHERE ("status" <> ALL (ARRAY['slot1_accepted'::"text", 'slot2_accepted'::"text", 'all_rejected'::"text", 'expired'::"text"]));

ALTER TABLE "public"."booking_alternative_proposals" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."booking_alternative_proposals" TO "anon";

GRANT ALL ON TABLE "public"."booking_alternative_proposals" TO "authenticated";

GRANT ALL ON TABLE "public"."booking_alternative_proposals" TO "service_role";
