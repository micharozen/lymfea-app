CREATE TABLE IF NOT EXISTS "public"."concierge_hotels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "concierge_id" "uuid" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."concierge_hotels" OWNER TO "postgres";

ALTER TABLE ONLY "public"."concierge_hotels"
    ADD CONSTRAINT "concierge_hotels_concierge_id_hotel_id_key" UNIQUE ("concierge_id", "hotel_id");

ALTER TABLE ONLY "public"."concierge_hotels"
    ADD CONSTRAINT "concierge_hotels_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."concierge_hotels" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."concierge_hotels" TO "anon";

GRANT ALL ON TABLE "public"."concierge_hotels" TO "authenticated";

GRANT ALL ON TABLE "public"."concierge_hotels" TO "service_role";
