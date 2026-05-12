CREATE TABLE IF NOT EXISTS "public"."therapist_schedule_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "therapist_id" "uuid" NOT NULL,
    "weekly_pattern" "jsonb" DEFAULT '[{"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}, {"shifts": [], "enabled": false}]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."therapist_schedule_templates" OWNER TO "postgres";

ALTER TABLE ONLY "public"."therapist_schedule_templates"
    ADD CONSTRAINT "therapist_schedule_templates_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."therapist_schedule_templates"
    ADD CONSTRAINT "unique_therapist_template" UNIQUE ("therapist_id");

ALTER TABLE "public"."therapist_schedule_templates" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."therapist_schedule_templates" TO "anon";

GRANT ALL ON TABLE "public"."therapist_schedule_templates" TO "authenticated";

GRANT ALL ON TABLE "public"."therapist_schedule_templates" TO "service_role";
