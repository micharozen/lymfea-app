CREATE TABLE IF NOT EXISTS "public"."booking_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_notes_content_check" CHECK (("char_length"("content") > 0))
);

ALTER TABLE "public"."booking_notes" OWNER TO "postgres";

ALTER TABLE ONLY "public"."booking_notes"
    ADD CONSTRAINT "booking_notes_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_booking_notes_booking" ON "public"."booking_notes" USING "btree" ("booking_id", "created_at");

ALTER TABLE "public"."booking_notes" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."booking_notes" TO "anon";

GRANT ALL ON TABLE "public"."booking_notes" TO "authenticated";

GRANT ALL ON TABLE "public"."booking_notes" TO "service_role";
