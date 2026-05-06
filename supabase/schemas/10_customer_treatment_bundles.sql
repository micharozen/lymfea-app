CREATE TABLE IF NOT EXISTS "public"."customer_treatment_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bundle_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "hotel_id" "text" NOT NULL,
    "total_sessions" integer,
    "used_sessions" integer DEFAULT 0 NOT NULL,
    "purchase_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expires_at" "date" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "sold_by" "uuid",
    "payment_reference" "text",
    "booking_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "beneficiary_customer_id" "uuid",
    "total_amount_cents" integer,
    "used_amount_cents" integer DEFAULT 0 NOT NULL,
    "is_gift" boolean DEFAULT false NOT NULL,
    "gift_delivery_mode" "text",
    "sender_name" "text",
    "sender_email" "text",
    "recipient_name" "text",
    "recipient_email" "text",
    "gift_message" "text",
    "redemption_code" "text",
    "delivered_at" timestamp with time zone,
    "claimed_at" timestamp with time zone,
    CONSTRAINT "chk_ctb_gift_shape" CHECK (((("is_gift" = false) AND ("gift_delivery_mode" IS NULL)) OR (("is_gift" = true) AND ("redemption_code" IS NOT NULL) AND ("gift_delivery_mode" IS NOT NULL)))),
    CONSTRAINT "chk_ctb_used_le_total_amount" CHECK ((("total_amount_cents" IS NULL) OR ("used_amount_cents" <= "total_amount_cents"))),
    CONSTRAINT "chk_ctb_used_le_total_sessions" CHECK ((("total_sessions" IS NULL) OR ("used_sessions" <= "total_sessions"))),
    CONSTRAINT "customer_treatment_bundles_gift_delivery_mode_check" CHECK ((("gift_delivery_mode" IS NULL) OR ("gift_delivery_mode" = ANY (ARRAY['email'::"text", 'print'::"text"])))),
    CONSTRAINT "customer_treatment_bundles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'expired'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "customer_treatment_bundles_total_amount_cents_check" CHECK ((("total_amount_cents" IS NULL) OR ("total_amount_cents" > 0))),
    CONSTRAINT "customer_treatment_bundles_used_amount_cents_check" CHECK (("used_amount_cents" >= 0)),
    CONSTRAINT "customer_treatment_bundles_used_sessions_check" CHECK (("used_sessions" >= 0))
);

ALTER TABLE "public"."customer_treatment_bundles" OWNER TO "postgres";

COMMENT ON TABLE "public"."customer_treatment_bundles" IS 'Sold bundles: tracks sessions used/remaining per customer';

COMMENT ON COLUMN "public"."customer_treatment_bundles"."sold_by" IS 'UUID of the admin/concierge who sold it manually (NULL if purchased online)';

COMMENT ON COLUMN "public"."customer_treatment_bundles"."booking_id" IS 'Reference to the purchase booking (client bought the cure as a treatment)';

COMMENT ON COLUMN "public"."customer_treatment_bundles"."beneficiary_customer_id" IS 'Customer who can consume this bundle. Same as customer_id for cures and self-purchased gifts. NULL for gifts awaiting claim.';

COMMENT ON COLUMN "public"."customer_treatment_bundles"."redemption_code" IS 'Public 10-char code used by the beneficiary to claim the gift at /portal/redeem';

ALTER TABLE ONLY "public"."customer_treatment_bundles"
    ADD CONSTRAINT "customer_treatment_bundles_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_customer_bundles_active" ON "public"."customer_treatment_bundles" USING "btree" ("customer_id", "hotel_id") WHERE ("status" = 'active'::"text");

CREATE INDEX "idx_customer_bundles_beneficiary" ON "public"."customer_treatment_bundles" USING "btree" ("beneficiary_customer_id") WHERE ("beneficiary_customer_id" IS NOT NULL);

CREATE INDEX "idx_customer_bundles_booking" ON "public"."customer_treatment_bundles" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);

CREATE INDEX "idx_customer_bundles_bundle" ON "public"."customer_treatment_bundles" USING "btree" ("bundle_id");

CREATE INDEX "idx_customer_bundles_customer" ON "public"."customer_treatment_bundles" USING "btree" ("customer_id");

CREATE INDEX "idx_customer_bundles_hotel" ON "public"."customer_treatment_bundles" USING "btree" ("hotel_id");

CREATE UNIQUE INDEX "uq_ctb_redemption_code" ON "public"."customer_treatment_bundles" USING "btree" ("redemption_code") WHERE ("redemption_code" IS NOT NULL);

ALTER TABLE "public"."customer_treatment_bundles" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."customer_treatment_bundles" TO "anon";

GRANT ALL ON TABLE "public"."customer_treatment_bundles" TO "authenticated";

GRANT ALL ON TABLE "public"."customer_treatment_bundles" TO "service_role";
