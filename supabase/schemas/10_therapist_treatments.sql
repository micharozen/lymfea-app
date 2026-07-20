CREATE TABLE IF NOT EXISTS "public"."therapist_treatments" (
    "therapist_id" "uuid" NOT NULL,
    "treatment_menu_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."therapist_treatments" OWNER TO "postgres";

ALTER TABLE ONLY "public"."therapist_treatments"
    ADD CONSTRAINT "therapist_treatments_pkey" PRIMARY KEY ("therapist_id", "treatment_menu_id");

CREATE INDEX IF NOT EXISTS "idx_therapist_treatments_treatment_menu_id" ON "public"."therapist_treatments" USING "btree" ("treatment_menu_id");

ALTER TABLE "public"."therapist_treatments" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."therapist_treatments" TO "anon";

GRANT ALL ON TABLE "public"."therapist_treatments" TO "authenticated";

GRANT ALL ON TABLE "public"."therapist_treatments" TO "service_role";
