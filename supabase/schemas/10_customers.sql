CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text",
    "email" "text",
    "first_name" "text",
    "last_name" "text",
    "preferred_therapist_id" "uuid",
    "preferred_treatment_type" "text",
    "health_notes" "text",
    "language" "text" DEFAULT 'fr'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_customer_id" "text",
    "auth_user_id" "uuid",
    "profile_completed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "customers_language_check" CHECK (("language" = ANY (ARRAY['fr'::"text", 'en'::"text"])))
);

ALTER TABLE "public"."customers" OWNER TO "postgres";

COMMENT ON TABLE "public"."customers" IS 'Persistent customer profiles with treatment history and preferences';

COMMENT ON COLUMN "public"."customers"."health_notes" IS 'Health notes, allergies, contraindications for spa treatments';

COMMENT ON COLUMN "public"."customers"."language" IS 'Preferred language for communications (fr or en)';

COMMENT ON COLUMN "public"."customers"."auth_user_id" IS 'Supabase Auth user linked to this customer profile (client portal). Unique when not NULL.';

COMMENT ON COLUMN "public"."customers"."profile_completed" IS 'False during portal onboarding until first_name + phone have been supplied by the customer.';

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_phone_key" UNIQUE ("phone");

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_stripe_customer_id_key" UNIQUE ("stripe_customer_id");

CREATE INDEX "idx_customers_email" ON "public"."customers" USING "btree" ("email") WHERE ("email" IS NOT NULL);

CREATE INDEX "idx_customers_preferred_therapist" ON "public"."customers" USING "btree" ("preferred_therapist_id") WHERE ("preferred_therapist_id" IS NOT NULL);

CREATE UNIQUE INDEX "uq_customers_auth_user_id" ON "public"."customers" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);

ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."customers" TO "anon";

GRANT ALL ON TABLE "public"."customers" TO "authenticated";

GRANT ALL ON TABLE "public"."customers" TO "service_role";
