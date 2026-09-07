CREATE TABLE IF NOT EXISTS "public"."voucher_resellers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "default_validity_months" integer,
    "sender_email_domain" "text",
    "code_pattern" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_vr_validity" CHECK ((("default_validity_months" IS NULL) OR ("default_validity_months" > 0)))
);

ALTER TABLE "public"."voucher_resellers" OWNER TO "postgres";

COMMENT ON TABLE "public"."voucher_resellers" IS 'Revendeurs externes de bons cadeaux (Wonderbox, Smartbox…), partagés par toute une organisation.';

COMMENT ON COLUMN "public"."voucher_resellers"."slug" IS 'Clé stable (wonderbox, smartbox) — servira au routage de la future ingestion email.';

COMMENT ON COLUMN "public"."voucher_resellers"."default_validity_months" IS 'Pré-remplit expires_at lors de la saisie manuelle d''un bon. NULL = à saisir à la main.';

COMMENT ON COLUMN "public"."voucher_resellers"."sender_email_domain" IS 'Domaine expéditeur du revendeur — clé de routage de la future ingestion email.';

COMMENT ON COLUMN "public"."voucher_resellers"."code_pattern" IS 'Regex optionnelle du format de code. Avertissement à la saisie, jamais bloquant.';

ALTER TABLE ONLY "public"."voucher_resellers"
    ADD CONSTRAINT "voucher_resellers_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "uq_voucher_resellers_org_slug" ON "public"."voucher_resellers" USING "btree" ("organization_id", "slug");

CREATE INDEX "idx_voucher_resellers_org_active" ON "public"."voucher_resellers" USING "btree" ("organization_id") WHERE "is_active";

ALTER TABLE "public"."voucher_resellers" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."voucher_resellers" TO "anon";

GRANT ALL ON TABLE "public"."voucher_resellers" TO "authenticated";

GRANT ALL ON TABLE "public"."voucher_resellers" TO "service_role";
