CREATE TABLE IF NOT EXISTS "public"."hotel_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT 'a0000000-0000-0000-0000-000000000001'::"uuid",
    "hotel_id" "text" NOT NULL,
    "booking_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hotel_ledger_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'billed'::"text", 'paid'::"text"])))
);

ALTER TABLE "public"."hotel_ledger" OWNER TO "postgres";

ALTER TABLE ONLY "public"."hotel_ledger"
    ADD CONSTRAINT "hotel_ledger_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_hotel_ledger_booking_id" ON "public"."hotel_ledger" USING "btree" ("booking_id");

CREATE INDEX "idx_hotel_ledger_hotel_id" ON "public"."hotel_ledger" USING "btree" ("hotel_id");

CREATE INDEX "idx_hotel_ledger_status" ON "public"."hotel_ledger" USING "btree" ("status");

ALTER TABLE "public"."hotel_ledger" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."hotel_ledger" TO "anon";

GRANT ALL ON TABLE "public"."hotel_ledger" TO "authenticated";

GRANT ALL ON TABLE "public"."hotel_ledger" TO "service_role";
