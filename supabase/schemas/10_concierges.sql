CREATE TABLE IF NOT EXISTS "public"."concierges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "country_code" "text" DEFAULT '+33'::"text" NOT NULL,
    "hotel_id" "text",
    "profile_image" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "must_change_password" boolean DEFAULT false NOT NULL,
    "venue_role" "text",
    "welcome_seen_at" timestamp with time zone
);

ALTER TABLE "public"."concierges" OWNER TO "postgres";

COMMENT ON COLUMN "public"."concierges"."must_change_password" IS 'Flag to force password change on first login';

ALTER TABLE ONLY "public"."concierges"
    ADD CONSTRAINT "concierges_email_key" UNIQUE ("email");

ALTER TABLE ONLY "public"."concierges"
    ADD CONSTRAINT "concierges_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."concierges" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."concierges" TO "anon";

GRANT ALL ON TABLE "public"."concierges" TO "authenticated";

GRANT ALL ON TABLE "public"."concierges" TO "service_role";
