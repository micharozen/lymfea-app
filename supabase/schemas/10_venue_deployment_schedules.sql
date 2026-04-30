CREATE TABLE IF NOT EXISTS "public"."venue_deployment_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "schedule_type" "public"."schedule_type" DEFAULT 'always_open'::"public"."schedule_type" NOT NULL,
    "days_of_week" integer[],
    "recurring_start_date" "date",
    "recurring_end_date" "date",
    "specific_dates" "date"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "recurrence_interval" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "recurrence_interval_positive" CHECK (("recurrence_interval" >= 1))
);

ALTER TABLE "public"."venue_deployment_schedules" OWNER TO "postgres";

COMMENT ON COLUMN "public"."venue_deployment_schedules"."recurrence_interval" IS 'Number of weeks between recurrences. 1 = every week, 2 = every other week, etc. Only applies when schedule_type = specific_days';

ALTER TABLE ONLY "public"."venue_deployment_schedules"
    ADD CONSTRAINT "unique_hotel_schedule" UNIQUE ("hotel_id");

ALTER TABLE ONLY "public"."venue_deployment_schedules"
    ADD CONSTRAINT "venue_deployment_schedules_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_venue_deployment_schedules_hotel_id" ON "public"."venue_deployment_schedules" USING "btree" ("hotel_id");

ALTER TABLE "public"."venue_deployment_schedules" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."venue_deployment_schedules" TO "anon";

GRANT ALL ON TABLE "public"."venue_deployment_schedules" TO "authenticated";

GRANT ALL ON TABLE "public"."venue_deployment_schedules" TO "service_role";
