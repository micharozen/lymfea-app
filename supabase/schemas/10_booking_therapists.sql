CREATE TABLE IF NOT EXISTS "public"."booking_therapists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "assigned_at" timestamp with time zone
);

ALTER TABLE "public"."booking_therapists" OWNER TO "postgres";

ALTER TABLE ONLY "public"."booking_therapists"
    ADD CONSTRAINT "booking_therapists_booking_id_therapist_id_key" UNIQUE ("booking_id", "therapist_id");

ALTER TABLE ONLY "public"."booking_therapists"
    ADD CONSTRAINT "booking_therapists_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_booking_therapists_booking" ON "public"."booking_therapists" USING "btree" ("booking_id");

CREATE INDEX "idx_booking_therapists_therapist" ON "public"."booking_therapists" USING "btree" ("therapist_id");

ALTER TABLE "public"."booking_therapists" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."booking_therapists" TO "anon";

GRANT ALL ON TABLE "public"."booking_therapists" TO "authenticated";

GRANT ALL ON TABLE "public"."booking_therapists" TO "service_role";
