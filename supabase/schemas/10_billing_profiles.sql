CREATE TABLE IF NOT EXISTS "public"."billing_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_type" "text" NOT NULL,
    "owner_id" "text" NOT NULL,
    "company_name" "text",
    "legal_form" "text",
    "siret" "text",
    "siren" "text",
    "tva_number" "text",
    "vat_exempt" boolean DEFAULT false NOT NULL,
    "billing_address" "text",
    "billing_postal_code" "text",
    "billing_city" "text",
    "billing_country" "text" DEFAULT 'France'::"text",
    "contact_email" "text",
    "contact_phone" "text",
    "iban" "text",
    "bic" "text",
    "bank_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_profiles_owner_type_check" CHECK (("owner_type" = ANY (ARRAY['therapist'::"text", 'hotel'::"text"])))
);

ALTER TABLE "public"."billing_profiles" OWNER TO "postgres";

COMMENT ON TABLE "public"."billing_profiles" IS 'Polymorphic billing info for therapists and hotels (used for invoice generation)';

COMMENT ON COLUMN "public"."billing_profiles"."owner_type" IS 'Target entity type: therapist or hotel';

COMMENT ON COLUMN "public"."billing_profiles"."owner_id" IS 'Logical FK to therapists.id or hotels.id (resolved by owner_type)';

COMMENT ON COLUMN "public"."billing_profiles"."vat_exempt" IS 'VAT exemption (art. 293 B du CGI) — typically auto-entrepreneurs';

ALTER TABLE ONLY "public"."billing_profiles"
    ADD CONSTRAINT "billing_profiles_owner_type_owner_id_key" UNIQUE ("owner_type", "owner_id");

ALTER TABLE ONLY "public"."billing_profiles"
    ADD CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_billing_profiles_owner" ON "public"."billing_profiles" USING "btree" ("owner_type", "owner_id");

ALTER TABLE "public"."billing_profiles" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."billing_profiles" TO "anon";

GRANT ALL ON TABLE "public"."billing_profiles" TO "authenticated";

GRANT ALL ON TABLE "public"."billing_profiles" TO "service_role";
