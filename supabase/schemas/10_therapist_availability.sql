CREATE TABLE IF NOT EXISTS "public"."therapist_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "shifts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_manually_edited" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_change_source" "text" DEFAULT 'unknown'::"text" NOT NULL
);

ALTER TABLE "public"."therapist_availability" OWNER TO "postgres";

ALTER TABLE ONLY "public"."therapist_availability"
    ADD CONSTRAINT "therapist_availability_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."therapist_availability"
    ADD CONSTRAINT "unique_therapist_date" UNIQUE ("therapist_id", "date");

CREATE INDEX "idx_therapist_availability_date" ON "public"."therapist_availability" USING "btree" ("date", "therapist_id") WHERE ("is_available" = true);

CREATE INDEX "idx_therapist_availability_range" ON "public"."therapist_availability" USING "btree" ("therapist_id", "date");

ALTER TABLE "public"."therapist_availability" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."therapist_availability" TO "anon";

GRANT ALL ON TABLE "public"."therapist_availability" TO "authenticated";

GRANT ALL ON TABLE "public"."therapist_availability" TO "service_role";
