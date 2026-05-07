CREATE TABLE IF NOT EXISTS "public"."therapist_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "rating_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone,
    CONSTRAINT "hairdresser_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);

ALTER TABLE "public"."therapist_ratings" OWNER TO "postgres";

COMMENT ON COLUMN "public"."therapist_ratings"."submitted_at" IS 'Timestamp when client finalized their rating - prevents subsequent updates';

ALTER TABLE ONLY "public"."therapist_ratings"
    ADD CONSTRAINT "hairdresser_ratings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."therapist_ratings"
    ADD CONSTRAINT "hairdresser_ratings_rating_token_key" UNIQUE ("rating_token");

CREATE INDEX "idx_hairdresser_ratings_hairdresser_id" ON "public"."therapist_ratings" USING "btree" ("therapist_id");

CREATE INDEX "idx_hairdresser_ratings_token" ON "public"."therapist_ratings" USING "btree" ("rating_token");

ALTER TABLE "public"."therapist_ratings" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."therapist_ratings" TO "anon";

GRANT ALL ON TABLE "public"."therapist_ratings" TO "authenticated";

GRANT ALL ON TABLE "public"."therapist_ratings" TO "service_role";
