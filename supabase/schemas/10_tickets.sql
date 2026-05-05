CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "creator_name" "text",
    "creator_role" "text",
    "notion_page_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "screenshot_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "tickets_category_check" CHECK (("category" = ANY (ARRAY['question'::"text", 'billing'::"text", 'booking'::"text", 'problem'::"text", 'other'::"text"]))),
    CONSTRAINT "tickets_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text", 'closed'::"text"])))
);

ALTER TABLE "public"."tickets" OWNER TO "postgres";

ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_tickets_created_at" ON "public"."tickets" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_tickets_created_by" ON "public"."tickets" USING "btree" ("created_by");

CREATE INDEX "idx_tickets_status" ON "public"."tickets" USING "btree" ("status");

ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."tickets" TO "anon";

GRANT ALL ON TABLE "public"."tickets" TO "authenticated";

GRANT ALL ON TABLE "public"."tickets" TO "service_role";
