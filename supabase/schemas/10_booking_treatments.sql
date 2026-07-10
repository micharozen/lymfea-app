CREATE TABLE IF NOT EXISTS "public"."booking_treatments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "variant_id" "uuid",
    "therapist_id" "uuid",
    "is_addon" boolean DEFAULT false NOT NULL,
    "parent_booking_treatment_id" "uuid",
    CONSTRAINT "booking_treatments_parent_requires_addon" CHECK (("parent_booking_treatment_id" IS NULL) OR "is_addon"),
    CONSTRAINT "booking_treatments_parent_not_self" CHECK ("parent_booking_treatment_id" IS DISTINCT FROM "id")
);

ALTER TABLE "public"."booking_treatments" OWNER TO "postgres";

ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."booking_treatments"
    ADD CONSTRAINT "booking_treatments_parent_booking_treatment_id_fkey" FOREIGN KEY ("parent_booking_treatment_id") REFERENCES "public"."booking_treatments"("id") ON DELETE CASCADE;

CREATE INDEX "idx_booking_treatments_therapist" ON "public"."booking_treatments" USING "btree" ("therapist_id");

CREATE INDEX "idx_booking_treatments_parent" ON "public"."booking_treatments" USING "btree" ("parent_booking_treatment_id") WHERE ("parent_booking_treatment_id" IS NOT NULL);

ALTER TABLE "public"."booking_treatments" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."booking_treatments" TO "anon";

GRANT ALL ON TABLE "public"."booking_treatments" TO "authenticated";

GRANT ALL ON TABLE "public"."booking_treatments" TO "service_role";
