CREATE TABLE IF NOT EXISTS "public"."therapists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "country_code" "text" DEFAULT '+33'::"text" NOT NULL,
    "phone" "text" NOT NULL,
    "profile_image" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "trunks" "text",
    "skills" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "stripe_account_id" "text",
    "password_set" boolean DEFAULT false,
    "stripe_onboarding_completed" boolean DEFAULT false,
    "minimum_guarantee" "jsonb" DEFAULT '{}'::"jsonb",
    "minimum_guarantee_active" boolean DEFAULT false,
    "hourly_rate" numeric(8,2) DEFAULT NULL::numeric,
    "rate_60" numeric,
    "rate_75" numeric,
    "rate_90" numeric,
    "gender" "text",
    CONSTRAINT "therapists_gender_check" CHECK (("gender" = ANY (ARRAY['female'::"text", 'male'::"text"])))
);

ALTER TABLE "public"."therapists" OWNER TO "postgres";

COMMENT ON COLUMN "public"."therapists"."rate_60" IS 'Fixed therapist payout for a 60-minute treatment';

COMMENT ON COLUMN "public"."therapists"."rate_75" IS 'Fixed therapist payout for a 75-minute treatment';

COMMENT ON COLUMN "public"."therapists"."rate_90" IS 'Fixed therapist payout for a 90-minute treatment';

ALTER TABLE ONLY "public"."therapists"
    ADD CONSTRAINT "hairdressers_phone_country_code_unique" UNIQUE ("phone", "country_code");

ALTER TABLE ONLY "public"."therapists"
    ADD CONSTRAINT "hairdressers_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."therapists" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."therapists" TO "anon";

GRANT ALL ON TABLE "public"."therapists" TO "authenticated";

GRANT ALL ON TABLE "public"."therapists" TO "service_role";
