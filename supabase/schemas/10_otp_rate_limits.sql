CREATE TABLE IF NOT EXISTS "public"."otp_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone_number" "text" NOT NULL,
    "request_type" "text" NOT NULL,
    "attempt_count" integer DEFAULT 1 NOT NULL,
    "first_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "blocked_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."otp_rate_limits" OWNER TO "postgres";

ALTER TABLE ONLY "public"."otp_rate_limits"
    ADD CONSTRAINT "otp_rate_limits_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_otp_rate_limits_first_attempt" ON "public"."otp_rate_limits" USING "btree" ("first_attempt_at");

CREATE UNIQUE INDEX "idx_otp_rate_limits_phone_type" ON "public"."otp_rate_limits" USING "btree" ("phone_number", "request_type");

ALTER TABLE "public"."otp_rate_limits" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."otp_rate_limits" TO "anon";

GRANT ALL ON TABLE "public"."otp_rate_limits" TO "authenticated";

GRANT ALL ON TABLE "public"."otp_rate_limits" TO "service_role";
