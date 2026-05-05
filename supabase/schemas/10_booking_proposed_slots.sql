CREATE TABLE IF NOT EXISTS "public"."booking_proposed_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "slot_1_date" "date" NOT NULL,
    "slot_1_time" time without time zone NOT NULL,
    "slot_2_date" "date",
    "slot_2_time" time without time zone,
    "slot_3_date" "date",
    "slot_3_time" time without time zone,
    "validated_slot" integer,
    "validated_by" "uuid",
    "validated_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '02:00:00'::interval) NOT NULL,
    "admin_notified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_proposed_slots_validated_slot_check" CHECK (("validated_slot" = ANY (ARRAY[1, 2, 3])))
);

ALTER TABLE "public"."booking_proposed_slots" OWNER TO "postgres";

COMMENT ON TABLE "public"."booking_proposed_slots" IS 'Stores up to 3 proposed time slots for concierge-created bookings. Hairdressers validate one slot before payment link is sent.';

COMMENT ON COLUMN "public"."booking_proposed_slots"."validated_slot" IS 'Which slot (1, 2, or 3) was validated by the hairdresser';

COMMENT ON COLUMN "public"."booking_proposed_slots"."expires_at" IS 'Auto-set to created_at + 2h. If no validation by then, admin is notified.';

ALTER TABLE ONLY "public"."booking_proposed_slots"
    ADD CONSTRAINT "booking_proposed_slots_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."booking_proposed_slots"
    ADD CONSTRAINT "unique_proposed_slots_per_booking" UNIQUE ("booking_id");

CREATE INDEX "idx_proposed_slots_booking_id" ON "public"."booking_proposed_slots" USING "btree" ("booking_id");

CREATE INDEX "idx_proposed_slots_expires_at" ON "public"."booking_proposed_slots" USING "btree" ("expires_at") WHERE (("validated_slot" IS NULL) AND ("admin_notified_at" IS NULL));

CREATE INDEX "idx_proposed_slots_validated_by" ON "public"."booking_proposed_slots" USING "btree" ("validated_by");

ALTER TABLE "public"."booking_proposed_slots" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."booking_proposed_slots" TO "anon";

GRANT ALL ON TABLE "public"."booking_proposed_slots" TO "authenticated";

GRANT ALL ON TABLE "public"."booking_proposed_slots" TO "service_role";
