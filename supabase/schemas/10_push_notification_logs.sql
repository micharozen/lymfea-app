CREATE TABLE IF NOT EXISTS "public"."push_notification_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."push_notification_logs" OWNER TO "postgres";

ALTER TABLE ONLY "public"."push_notification_logs"
    ADD CONSTRAINT "push_notification_logs_booking_id_user_id_key" UNIQUE ("booking_id", "user_id");

ALTER TABLE ONLY "public"."push_notification_logs"
    ADD CONSTRAINT "push_notification_logs_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_push_notification_logs_booking_user" ON "public"."push_notification_logs" USING "btree" ("booking_id", "user_id");

ALTER TABLE "public"."push_notification_logs" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."push_notification_logs" TO "anon";

GRANT ALL ON TABLE "public"."push_notification_logs" TO "authenticated";

GRANT ALL ON TABLE "public"."push_notification_logs" TO "service_role";
