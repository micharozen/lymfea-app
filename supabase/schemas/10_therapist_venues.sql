CREATE TABLE IF NOT EXISTS "public"."therapist_venues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "priority" integer DEFAULT 1 NOT NULL
);

ALTER TABLE "public"."therapist_venues" OWNER TO "postgres";

ALTER TABLE ONLY "public"."therapist_venues"
    ADD CONSTRAINT "hairdresser_hotels_hairdresser_id_hotel_id_key" UNIQUE ("therapist_id", "hotel_id");

ALTER TABLE ONLY "public"."therapist_venues"
    ADD CONSTRAINT "hairdresser_hotels_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."therapist_venues"
    ADD CONSTRAINT "therapist_venues_priority_positive" CHECK (("priority" >= 1));

CREATE INDEX IF NOT EXISTS "idx_therapist_venues_hotel_priority" ON "public"."therapist_venues" USING "btree" ("hotel_id", "priority");

ALTER TABLE "public"."therapist_venues" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."therapist_venues" TO "anon";

GRANT ALL ON TABLE "public"."therapist_venues" TO "authenticated";

GRANT ALL ON TABLE "public"."therapist_venues" TO "service_role";
