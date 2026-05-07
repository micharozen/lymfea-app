CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."push_tokens" OWNER TO "postgres";

ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");

CREATE INDEX "idx_push_tokens_user_id" ON "public"."push_tokens" USING "btree" ("user_id");

ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."push_tokens" TO "anon";

GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";

GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";
