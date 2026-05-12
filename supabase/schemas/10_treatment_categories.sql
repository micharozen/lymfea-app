CREATE TABLE IF NOT EXISTS "public"."treatment_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name_en" "text",
    "is_addon" boolean DEFAULT false NOT NULL
);

ALTER TABLE "public"."treatment_categories" OWNER TO "postgres";

ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_name_hotel_id_key" UNIQUE ("name", "hotel_id");

ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_treatment_categories_hotel_id" ON "public"."treatment_categories" USING "btree" ("hotel_id");

ALTER TABLE "public"."treatment_categories" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."treatment_categories" TO "anon";

GRANT ALL ON TABLE "public"."treatment_categories" TO "authenticated";

GRANT ALL ON TABLE "public"."treatment_categories" TO "service_role";
