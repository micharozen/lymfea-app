CREATE TABLE IF NOT EXISTS "public"."gift_code_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attempt_key" "text" NOT NULL,
    "succeeded" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."gift_code_attempts" OWNER TO "postgres";

COMMENT ON TABLE "public"."gift_code_attempts" IS 'Audit of lookup_gift_card_by_code calls for brute-force rate limiting. attempt_key = IP or session identifier.';

ALTER TABLE ONLY "public"."gift_code_attempts"
    ADD CONSTRAINT "gift_code_attempts_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_gift_code_attempts_key_time" ON "public"."gift_code_attempts" USING "btree" ("attempt_key", "created_at" DESC);

ALTER TABLE "public"."gift_code_attempts" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."gift_code_attempts" TO "anon";

GRANT ALL ON TABLE "public"."gift_code_attempts" TO "authenticated";

GRANT ALL ON TABLE "public"."gift_code_attempts" TO "service_role";
