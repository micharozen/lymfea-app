CREATE TABLE IF NOT EXISTS "public"."therapist_absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "reason" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "therapist_absences_reason_check" CHECK (("reason" = ANY (ARRAY['vacation'::"text", 'sick'::"text", 'other'::"text"]))),
    CONSTRAINT "valid_date_range" CHECK (("end_date" >= "start_date"))
);

ALTER TABLE "public"."therapist_absences" OWNER TO "postgres";

ALTER TABLE ONLY "public"."therapist_absences"
    ADD CONSTRAINT "therapist_absences_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_therapist_absences_date_range" ON "public"."therapist_absences" USING "btree" ("start_date", "end_date");

CREATE INDEX "idx_therapist_absences_therapist_date" ON "public"."therapist_absences" USING "btree" ("therapist_id", "start_date", "end_date");

ALTER TABLE "public"."therapist_absences" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."therapist_absences" TO "anon";

GRANT ALL ON TABLE "public"."therapist_absences" TO "authenticated";

GRANT ALL ON TABLE "public"."therapist_absences" TO "service_role";
