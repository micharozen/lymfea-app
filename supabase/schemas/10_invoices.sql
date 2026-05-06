CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_kind" "text" NOT NULL,
    "issuer_type" "text" NOT NULL,
    "issuer_id" "text",
    "client_type" "text" NOT NULL,
    "client_id" "text",
    "therapist_id" "uuid",
    "hotel_id" "text",
    "invoice_number" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date" NOT NULL,
    "amount_ht" numeric(10,2) NOT NULL,
    "vat_rate" numeric(5,2) DEFAULT 20 NOT NULL,
    "vat_amount" numeric(10,2) NOT NULL,
    "amount_ttc" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "bookings_count" integer DEFAULT 0 NOT NULL,
    "html_snapshot" "text",
    "issuer_snapshot" "jsonb",
    "client_snapshot" "jsonb",
    "metadata" "jsonb",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_client_type_check" CHECK (("client_type" = ANY (ARRAY['therapist'::"text", 'hotel'::"text", 'lymfea'::"text"]))),
    CONSTRAINT "invoices_invoice_kind_check" CHECK (("invoice_kind" = ANY (ARRAY['therapist_commission'::"text", 'hotel_commission'::"text"]))),
    CONSTRAINT "invoices_issuer_type_check" CHECK (("issuer_type" = ANY (ARRAY['therapist'::"text", 'hotel'::"text", 'lymfea'::"text"]))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'issued'::"text", 'paid'::"text", 'cancelled'::"text"])))
);

ALTER TABLE "public"."invoices" OWNER TO "postgres";

COMMENT ON TABLE "public"."invoices" IS 'Generic invoice table supporting multiple kinds (therapist commission, hotel commission)';

COMMENT ON COLUMN "public"."invoices"."invoice_kind" IS 'therapist_commission (Lymfea→therapist) | hotel_commission (Lymfea→hotel)';

COMMENT ON COLUMN "public"."invoices"."html_snapshot" IS 'Frozen HTML document generated at creation time';

COMMENT ON COLUMN "public"."invoices"."issuer_snapshot" IS 'Frozen copy of issuer billing profile at generation time';

COMMENT ON COLUMN "public"."invoices"."client_snapshot" IS 'Frozen copy of client billing profile at generation time';

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_kind_therapist_id_hotel_id_period_start_key" UNIQUE ("invoice_kind", "therapist_id", "hotel_id", "period_start");

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_invoices_hotel" ON "public"."invoices" USING "btree" ("hotel_id") WHERE ("hotel_id" IS NOT NULL);

CREATE INDEX "idx_invoices_kind" ON "public"."invoices" USING "btree" ("invoice_kind");

CREATE INDEX "idx_invoices_period" ON "public"."invoices" USING "btree" ("period_start");

CREATE INDEX "idx_invoices_therapist" ON "public"."invoices" USING "btree" ("therapist_id") WHERE ("therapist_id" IS NOT NULL);

ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."invoices" TO "anon";

GRANT ALL ON TABLE "public"."invoices" TO "authenticated";

GRANT ALL ON TABLE "public"."invoices" TO "service_role";
