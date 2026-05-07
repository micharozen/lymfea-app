CREATE TABLE IF NOT EXISTS "public"."bundle_session_usages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_bundle_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."bundle_session_usages" OWNER TO "postgres";

COMMENT ON TABLE "public"."bundle_session_usages" IS 'Tracks each session usage: which booking consumed a bundle credit';

ALTER TABLE ONLY "public"."bundle_session_usages"
    ADD CONSTRAINT "bundle_session_usages_booking_id_key" UNIQUE ("booking_id");

ALTER TABLE ONLY "public"."bundle_session_usages"
    ADD CONSTRAINT "bundle_session_usages_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_bundle_usages_booking" ON "public"."bundle_session_usages" USING "btree" ("booking_id");

CREATE INDEX "idx_bundle_usages_customer_bundle" ON "public"."bundle_session_usages" USING "btree" ("customer_bundle_id");

CREATE INDEX "idx_bundle_usages_treatment" ON "public"."bundle_session_usages" USING "btree" ("treatment_id");

ALTER TABLE "public"."bundle_session_usages" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."bundle_session_usages" TO "anon";

GRANT ALL ON TABLE "public"."bundle_session_usages" TO "authenticated";

GRANT ALL ON TABLE "public"."bundle_session_usages" TO "service_role";
