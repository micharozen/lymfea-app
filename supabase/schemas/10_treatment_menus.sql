CREATE TABLE IF NOT EXISTS "public"."treatment_menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "duration" integer,
    "price" numeric(10,2) DEFAULT 0.00,
    "lead_time" integer,
    "service_for" "text" NOT NULL,
    "category" "text" NOT NULL,
    "hotel_id" "text",
    "image" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sort_order" integer DEFAULT 0,
    "price_on_request" boolean DEFAULT false,
    "currency" "text" DEFAULT 'EUR'::"text",
    "is_bestseller" boolean DEFAULT false,
    "requires_room" boolean DEFAULT false,
    "treatment_type" "text",
    "name_en" "text",
    "description_en" "text",
    "is_bundle" boolean DEFAULT false,
    "bundle_id" "uuid",
    "is_addon" boolean DEFAULT false NOT NULL,
    "slug" "text" NOT NULL,
    "available_days" integer[],
    CONSTRAINT "treatment_menus_slug_pattern_check" CHECK ((("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text") AND (("length"("slug") >= 2) AND ("length"("slug") <= 60))))
);

ALTER TABLE "public"."treatment_menus" OWNER TO "postgres";

COMMENT ON COLUMN "public"."treatment_menus"."requires_room" IS 'Whether this treatment requires a dedicated treatment room/cabin';

COMMENT ON COLUMN "public"."treatment_menus"."treatment_type" IS 'Treatment category: body, face, wellness, etc.';

COMMENT ON COLUMN "public"."treatment_menus"."is_bundle" IS 'True if this treatment represents a bundle/cure purchase in the client flow';

COMMENT ON COLUMN "public"."treatment_menus"."bundle_id" IS 'Reference to the bundle template this treatment represents';

COMMENT ON COLUMN "public"."treatment_menus"."available_days" IS 'Jours autorisés : 0=Dim, 1=Lun, ..., 6=Sam. NULL = disponible tous les jours.';

ALTER TABLE ONLY "public"."treatment_menus"
    ADD CONSTRAINT "treatment_menus_hotel_slug_key" UNIQUE ("hotel_id", "slug");

ALTER TABLE ONLY "public"."treatment_menus"
    ADD CONSTRAINT "treatment_menus_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_treatment_menus_bundle" ON "public"."treatment_menus" USING "btree" ("bundle_id") WHERE ("bundle_id" IS NOT NULL);

CREATE INDEX "idx_treatment_menus_is_addon" ON "public"."treatment_menus" USING "btree" ("hotel_id", "is_addon") WHERE ("is_addon" = true);

ALTER TABLE "public"."treatment_menus" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."treatment_menus" TO "anon";

GRANT ALL ON TABLE "public"."treatment_menus" TO "authenticated";

GRANT ALL ON TABLE "public"."treatment_menus" TO "service_role";
