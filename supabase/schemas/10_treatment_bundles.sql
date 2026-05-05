CREATE TABLE IF NOT EXISTS "public"."treatment_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "description" "text",
    "description_en" "text",
    "total_sessions" integer,
    "price" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text",
    "validity_days" integer DEFAULT 365,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bundle_type" "text" DEFAULT 'cure'::"text" NOT NULL,
    "amount_cents" integer,
    "title" "text",
    "title_en" "text",
    "cover_image_url" "text",
    "display_on_client_flow" boolean DEFAULT true NOT NULL,
    CONSTRAINT "chk_bundle_amount_shape" CHECK (((("bundle_type" = 'gift_amount'::"text") AND ("amount_cents" IS NOT NULL)) OR (("bundle_type" <> 'gift_amount'::"text") AND ("amount_cents" IS NULL)))),
    CONSTRAINT "chk_bundle_sessions_shape" CHECK (((("bundle_type" = ANY (ARRAY['cure'::"text", 'gift_treatments'::"text"])) AND ("total_sessions" IS NOT NULL) AND ("total_sessions" > 0)) OR (("bundle_type" = 'gift_amount'::"text") AND ("total_sessions" IS NULL)))),
    CONSTRAINT "treatment_bundles_amount_cents_check" CHECK ((("amount_cents" IS NULL) OR ("amount_cents" > 0))),
    CONSTRAINT "treatment_bundles_bundle_type_check" CHECK (("bundle_type" = ANY (ARRAY['cure'::"text", 'gift_treatments'::"text", 'gift_amount'::"text"]))),
    CONSTRAINT "treatment_bundles_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "treatment_bundles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);

ALTER TABLE "public"."treatment_bundles" OWNER TO "postgres";

COMMENT ON TABLE "public"."treatment_bundles" IS 'Bundle/cure templates: N sessions of eligible treatments sold as a package';

COMMENT ON COLUMN "public"."treatment_bundles"."bundle_type" IS 'cure = multi-session package, gift_treatments = gift card for N sessions, gift_amount = gift card for a monetary amount';

COMMENT ON COLUMN "public"."treatment_bundles"."amount_cents" IS 'Monetary value for gift_amount bundles (in cents). Required iff bundle_type = gift_amount';

COMMENT ON COLUMN "public"."treatment_bundles"."title" IS 'Marketing title for gift cards (displayed on the card visual and email)';

COMMENT ON COLUMN "public"."treatment_bundles"."cover_image_url" IS 'Visual image for the gift card (shown in client flow and embedded in the email)';

ALTER TABLE ONLY "public"."treatment_bundles"
    ADD CONSTRAINT "treatment_bundles_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_treatment_bundles_hotel" ON "public"."treatment_bundles" USING "btree" ("hotel_id");

CREATE INDEX "idx_treatment_bundles_status" ON "public"."treatment_bundles" USING "btree" ("status");

CREATE INDEX "idx_treatment_bundles_type" ON "public"."treatment_bundles" USING "btree" ("hotel_id", "bundle_type");

ALTER TABLE "public"."treatment_bundles" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."treatment_bundles" TO "anon";

GRANT ALL ON TABLE "public"."treatment_bundles" TO "authenticated";

GRANT ALL ON TABLE "public"."treatment_bundles" TO "service_role";
