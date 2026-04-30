CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "change_type" "text" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "source" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_flagged" boolean DEFAULT false NOT NULL,
    "flag_type" "text",
    "acknowledged_at" timestamp with time zone,
    "acknowledged_by" "uuid",
    CONSTRAINT "audit_log_change_type_check" CHECK (("change_type" = ANY (ARRAY['insert'::"text", 'update'::"text", 'delete'::"text", 'action'::"text"])))
);

ALTER TABLE "public"."audit_log" OWNER TO "postgres";

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_audit_log_bookings" ON "public"."audit_log" USING "btree" ("record_id", "changed_at" DESC) WHERE ("table_name" = 'bookings'::"text");

CREATE INDEX "idx_audit_log_flags" ON "public"."audit_log" USING "btree" ("is_flagged", "acknowledged_at") WHERE (("is_flagged" = true) AND ("acknowledged_at" IS NULL));

CREATE INDEX "idx_audit_log_metadata_therapist" ON "public"."audit_log" USING "btree" ((("metadata" ->> 'therapist_id'::"text"))) WHERE ("table_name" = 'therapist_availability'::"text");

CREATE INDEX "idx_audit_log_table_date" ON "public"."audit_log" USING "btree" ("table_name", "changed_at" DESC);

CREATE INDEX "idx_audit_log_table_record" ON "public"."audit_log" USING "btree" ("table_name", "record_id", "changed_at" DESC);

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."audit_log" TO "anon";

GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";

GRANT ALL ON TABLE "public"."audit_log" TO "service_role";
