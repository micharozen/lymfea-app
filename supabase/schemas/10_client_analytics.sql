CREATE TABLE IF NOT EXISTS "public"."client_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_name" "text" NOT NULL,
    "page_path" "text",
    "referrer" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "user_agent" "text",
    "device_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "client_analytics_device_type_check" CHECK (("device_type" = ANY (ARRAY['mobile'::"text", 'tablet'::"text", 'desktop'::"text", 'unknown'::"text"]))),
    CONSTRAINT "client_analytics_event_type_check" CHECK (("event_type" = ANY (ARRAY['page_view'::"text", 'action'::"text", 'conversion'::"text"])))
);

ALTER TABLE "public"."client_analytics" OWNER TO "postgres";

ALTER TABLE ONLY "public"."client_analytics"
    ADD CONSTRAINT "client_analytics_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_client_analytics_created_at" ON "public"."client_analytics" USING "btree" ("created_at");

CREATE INDEX "idx_client_analytics_event_name" ON "public"."client_analytics" USING "btree" ("event_name");

CREATE INDEX "idx_client_analytics_event_type" ON "public"."client_analytics" USING "btree" ("event_type");

CREATE INDEX "idx_client_analytics_hotel_created" ON "public"."client_analytics" USING "btree" ("hotel_id", "created_at");

CREATE INDEX "idx_client_analytics_hotel_id" ON "public"."client_analytics" USING "btree" ("hotel_id");

CREATE INDEX "idx_client_analytics_session_id" ON "public"."client_analytics" USING "btree" ("session_id");

ALTER TABLE "public"."client_analytics" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."client_analytics" TO "anon";

GRANT ALL ON TABLE "public"."client_analytics" TO "authenticated";

GRANT ALL ON TABLE "public"."client_analytics" TO "service_role";
