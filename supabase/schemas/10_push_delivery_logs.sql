-- Journal d'envoi des notifications push : une ligne par appel OneSignal, avec
-- le statut réel de délivrance. À ne pas confondre avec `push_notification_logs`,
-- qui est le registre de dédup du broadcast et non un journal.
CREATE TABLE IF NOT EXISTS "public"."push_delivery_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "notification_type" "text",
    "status" "text" NOT NULL,
    "onesignal_notification_id" "text",
    "error" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_delivery_logs_status_check" CHECK (("status" = ANY (ARRAY['delivered'::"text", 'undelivered'::"text", 'error'::"text"])))
);

ALTER TABLE "public"."push_delivery_logs" OWNER TO "postgres";

ALTER TABLE ONLY "public"."push_delivery_logs"
    ADD CONSTRAINT "push_delivery_logs_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_push_delivery_logs_user_sent" ON "public"."push_delivery_logs" USING "btree" ("user_id", "sent_at" DESC);

CREATE INDEX "idx_push_delivery_logs_booking" ON "public"."push_delivery_logs" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);

CREATE INDEX "idx_push_delivery_logs_failures" ON "public"."push_delivery_logs" USING "btree" ("sent_at" DESC) WHERE ("status" <> 'delivered'::"text");

ALTER TABLE "public"."push_delivery_logs" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."push_delivery_logs" TO "anon";

GRANT ALL ON TABLE "public"."push_delivery_logs" TO "authenticated";

GRANT ALL ON TABLE "public"."push_delivery_logs" TO "service_role";
