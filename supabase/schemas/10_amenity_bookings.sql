CREATE TABLE IF NOT EXISTS "public"."amenity_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "venue_amenity_id" "uuid" NOT NULL,
    "booking_date" "date" NOT NULL,
    "booking_time" time without time zone NOT NULL,
    "duration" integer NOT NULL,
    "end_time" time without time zone NOT NULL,
    "customer_id" "uuid",
    "client_type" "text" NOT NULL,
    "room_number" "text",
    "linked_booking_id" "uuid",
    "num_guests" integer DEFAULT 1 NOT NULL,
    "price" numeric(10,2) DEFAULT 0,
    "payment_method" "text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "amenity_bookings_client_type_check" CHECK (("client_type" = ANY (ARRAY['external'::"text", 'internal'::"text", 'lymfea'::"text"]))),
    CONSTRAINT "amenity_bookings_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'cancelled'::"text", 'completed'::"text", 'noshow'::"text"])))
);

ALTER TABLE "public"."amenity_bookings" OWNER TO "postgres";

COMMENT ON TABLE "public"."amenity_bookings" IS 'Capacity-based amenity reservations (pool, fitness, etc.)';

COMMENT ON COLUMN "public"."amenity_bookings"."end_time" IS 'Pre-computed end time for efficient overlap queries';

COMMENT ON COLUMN "public"."amenity_bookings"."client_type" IS 'external = paying guest, internal = hotel guest (free), lymfea = treatment client';

COMMENT ON COLUMN "public"."amenity_bookings"."linked_booking_id" IS 'For lymfea clients: reference to the treatment booking that includes amenity access';

ALTER TABLE ONLY "public"."amenity_bookings"
    ADD CONSTRAINT "amenity_bookings_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_amenity_bookings_amenity_date" ON "public"."amenity_bookings" USING "btree" ("venue_amenity_id", "booking_date");

CREATE INDEX "idx_amenity_bookings_customer" ON "public"."amenity_bookings" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);

CREATE INDEX "idx_amenity_bookings_venue_date" ON "public"."amenity_bookings" USING "btree" ("hotel_id", "booking_date");

ALTER TABLE "public"."amenity_bookings" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."amenity_bookings" TO "anon";

GRANT ALL ON TABLE "public"."amenity_bookings" TO "authenticated";

GRANT ALL ON TABLE "public"."amenity_bookings" TO "service_role";
