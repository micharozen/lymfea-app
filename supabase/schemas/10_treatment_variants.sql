CREATE TABLE IF NOT EXISTS "public"."treatment_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "label" "text",
    "duration" integer NOT NULL,
    "price" numeric(10,2),
    "price_on_request" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "is_default" boolean DEFAULT false,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "label_en" "text",
    "guest_count" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "treatment_variants_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);

ALTER TABLE "public"."treatment_variants" OWNER TO "postgres";

ALTER TABLE ONLY "public"."treatment_variants"
    ADD CONSTRAINT "treatment_variants_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_treatment_variants_treatment_id" ON "public"."treatment_variants" USING "btree" ("treatment_id");

ALTER TABLE "public"."treatment_variants" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."treatment_variants" TO "anon";

GRANT ALL ON TABLE "public"."treatment_variants" TO "authenticated";

GRANT ALL ON TABLE "public"."treatment_variants" TO "service_role";
