CREATE TABLE IF NOT EXISTS "public"."hotel_pms_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "pms_type" "text" DEFAULT 'opera_cloud'::"text" NOT NULL,
    "gateway_url" "text",
    "client_id" "text",
    "client_secret" "text",
    "app_key" "text",
    "enterprise_id" "text",
    "pms_hotel_id" "text",
    "auto_charge_room" boolean DEFAULT false,
    "guest_lookup_enabled" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "access_token" "text",
    "service_id" "text",
    "accounting_category_id" "text",
    "api_url" "text",
    "connection_status" "text" DEFAULT 'unknown'::"text",
    "connection_verified_at" timestamp with time zone
);

ALTER TABLE "public"."hotel_pms_configs" OWNER TO "postgres";

COMMENT ON COLUMN "public"."hotel_pms_configs"."access_token" IS 'Mews: per-property AccessToken';

COMMENT ON COLUMN "public"."hotel_pms_configs"."service_id" IS 'Mews: Spa ServiceId for posting charges';

COMMENT ON COLUMN "public"."hotel_pms_configs"."accounting_category_id" IS 'Mews: accounting category for spa charges (optional)';

COMMENT ON COLUMN "public"."hotel_pms_configs"."api_url" IS 'API base URL (Mews: api.mews.com or api.mews-demo.com)';

COMMENT ON COLUMN "public"."hotel_pms_configs"."connection_status" IS 'Last test result: connected, failed, unknown';

COMMENT ON COLUMN "public"."hotel_pms_configs"."connection_verified_at" IS 'Timestamp of last successful connection test';

ALTER TABLE ONLY "public"."hotel_pms_configs"
    ADD CONSTRAINT "hotel_pms_configs_hotel_id_key" UNIQUE ("hotel_id");

ALTER TABLE ONLY "public"."hotel_pms_configs"
    ADD CONSTRAINT "hotel_pms_configs_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."hotel_pms_configs" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."hotel_pms_configs" TO "anon";

GRANT ALL ON TABLE "public"."hotel_pms_configs" TO "authenticated";

GRANT ALL ON TABLE "public"."hotel_pms_configs" TO "service_role";
