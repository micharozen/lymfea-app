CREATE TABLE IF NOT EXISTS "public"."treatment_addons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_treatment_id" "uuid" NOT NULL,
    "addon_treatment_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "treatment_addons_no_self" CHECK (("parent_treatment_id" <> "addon_treatment_id"))
);

ALTER TABLE "public"."treatment_addons" OWNER TO "postgres";

ALTER TABLE ONLY "public"."treatment_addons"
    ADD CONSTRAINT "treatment_addons_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."treatment_addons"
    ADD CONSTRAINT "treatment_addons_unique" UNIQUE ("parent_treatment_id", "addon_treatment_id");

CREATE INDEX "idx_treatment_addons_addon" ON "public"."treatment_addons" USING "btree" ("addon_treatment_id");

CREATE INDEX "idx_treatment_addons_parent" ON "public"."treatment_addons" USING "btree" ("parent_treatment_id");

ALTER TABLE "public"."treatment_addons" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."treatment_addons" TO "anon";

GRANT ALL ON TABLE "public"."treatment_addons" TO "authenticated";

GRANT ALL ON TABLE "public"."treatment_addons" TO "service_role";
