CREATE TABLE IF NOT EXISTS "public"."bundle_amount_usages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_bundle_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "amount_cents_used" integer NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bundle_amount_usages_amount_cents_used_check" CHECK (("amount_cents_used" > 0))
);

ALTER TABLE "public"."bundle_amount_usages" OWNER TO "postgres";

COMMENT ON TABLE "public"."bundle_amount_usages" IS 'Audit trail for each redemption of a gift_amount bundle on a booking';

ALTER TABLE ONLY "public"."bundle_amount_usages"
    ADD CONSTRAINT "bundle_amount_usages_booking_id_customer_bundle_id_key" UNIQUE ("booking_id", "customer_bundle_id");

ALTER TABLE ONLY "public"."bundle_amount_usages"
    ADD CONSTRAINT "bundle_amount_usages_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_bundle_amount_usages_booking" ON "public"."bundle_amount_usages" USING "btree" ("booking_id");

CREATE INDEX "idx_bundle_amount_usages_bundle" ON "public"."bundle_amount_usages" USING "btree" ("customer_bundle_id");

ALTER TABLE "public"."bundle_amount_usages" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."bundle_amount_usages" TO "anon";

GRANT ALL ON TABLE "public"."bundle_amount_usages" TO "authenticated";

GRANT ALL ON TABLE "public"."bundle_amount_usages" TO "service_role";
