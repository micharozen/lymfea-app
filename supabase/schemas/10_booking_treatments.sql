CREATE TABLE IF NOT EXISTS "public"."booking_treatments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "variant_id" "uuid",
    "therapist_id" "uuid"
);

ALTER TABLE "public"."booking_treatments" OWNER TO "postgres";

ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_booking_treatments_therapist" ON "public"."booking_treatments" USING "btree" ("therapist_id");

ALTER TABLE "public"."booking_treatments" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."booking_treatments" TO "anon";

GRANT ALL ON TABLE "public"."booking_treatments" TO "authenticated";

GRANT ALL ON TABLE "public"."booking_treatments" TO "service_role";
