CREATE TABLE IF NOT EXISTS "public"."admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "country_code" "text" DEFAULT '+33'::"text" NOT NULL,
    "profile_image" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "welcome_seen_at" timestamp with time zone
);

ALTER TABLE "public"."admins" OWNER TO "postgres";

ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_email_key" UNIQUE ("email");

ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_admins_email" ON "public"."admins" USING "btree" ("email");

CREATE INDEX "idx_admins_user_id" ON "public"."admins" USING "btree" ("user_id");

ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."admins" TO "anon";

GRANT ALL ON TABLE "public"."admins" TO "authenticated";

GRANT ALL ON TABLE "public"."admins" TO "service_role";
