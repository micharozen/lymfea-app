CREATE TABLE IF NOT EXISTS "public"."venue_amenities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "name" "text",
    "color" "text" DEFAULT '#3b82f6'::"text" NOT NULL,
    "capacity_per_slot" integer DEFAULT 10 NOT NULL,
    "slot_duration" integer DEFAULT 60 NOT NULL,
    "prep_time" integer DEFAULT 0 NOT NULL,
    "price_external" numeric(10,2) DEFAULT 0,
    "price_lymfea" numeric(10,2) DEFAULT 0,
    "lymfea_access_included" boolean DEFAULT true NOT NULL,
    "lymfea_access_duration" integer DEFAULT 60,
    "currency" "text" DEFAULT 'EUR'::"text",
    "opening_time" time without time zone,
    "closing_time" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."venue_amenities" OWNER TO "postgres";

COMMENT ON TABLE "public"."venue_amenities" IS 'Per-venue amenity configuration (pool, fitness, sauna, etc.)';

COMMENT ON COLUMN "public"."venue_amenities"."type" IS 'Amenity type key matching frontend AMENITY_TYPES constant';

COMMENT ON COLUMN "public"."venue_amenities"."prep_time" IS 'Cleaning/prep time in minutes between bookings for privatized amenities';

COMMENT ON COLUMN "public"."venue_amenities"."lymfea_access_included" IS 'Whether spa treatment clients get free amenity access';

COMMENT ON COLUMN "public"."venue_amenities"."lymfea_access_duration" IS 'Duration in minutes of complimentary access for treatment clients';

ALTER TABLE ONLY "public"."venue_amenities"
    ADD CONSTRAINT "venue_amenities_hotel_id_type_key" UNIQUE ("hotel_id", "type");

ALTER TABLE ONLY "public"."venue_amenities"
    ADD CONSTRAINT "venue_amenities_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_venue_amenities_hotel" ON "public"."venue_amenities" USING "btree" ("hotel_id");

ALTER TABLE "public"."venue_amenities" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."venue_amenities" TO "anon";

GRANT ALL ON TABLE "public"."venue_amenities" TO "authenticated";

GRANT ALL ON TABLE "public"."venue_amenities" TO "service_role";
