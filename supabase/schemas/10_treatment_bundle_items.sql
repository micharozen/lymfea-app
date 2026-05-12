CREATE TABLE IF NOT EXISTS "public"."treatment_bundle_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bundle_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL
);

ALTER TABLE "public"."treatment_bundle_items" OWNER TO "postgres";

COMMENT ON TABLE "public"."treatment_bundle_items" IS 'Junction table: which treatments are eligible for a given bundle';

ALTER TABLE ONLY "public"."treatment_bundle_items"
    ADD CONSTRAINT "treatment_bundle_items_bundle_id_treatment_id_key" UNIQUE ("bundle_id", "treatment_id");

ALTER TABLE ONLY "public"."treatment_bundle_items"
    ADD CONSTRAINT "treatment_bundle_items_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_treatment_bundle_items_bundle" ON "public"."treatment_bundle_items" USING "btree" ("bundle_id");

CREATE INDEX "idx_treatment_bundle_items_treatment" ON "public"."treatment_bundle_items" USING "btree" ("treatment_id");

ALTER TABLE "public"."treatment_bundle_items" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."treatment_bundle_items" TO "anon";

GRANT ALL ON TABLE "public"."treatment_bundle_items" TO "authenticated";

GRANT ALL ON TABLE "public"."treatment_bundle_items" TO "service_role";
