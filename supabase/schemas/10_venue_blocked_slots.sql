CREATE TABLE IF NOT EXISTS "public"."venue_blocked_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "days_of_week" integer[],
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "blocked_slot_time_order" CHECK (("start_time" < "end_time"))
);

ALTER TABLE "public"."venue_blocked_slots" OWNER TO "postgres";

COMMENT ON TABLE "public"."venue_blocked_slots" IS 'Defines time ranges when a venue cannot accept bookings (e.g., lunch breaks). Slots falling within these ranges are filtered out of check-availability results.';

COMMENT ON COLUMN "public"."venue_blocked_slots"."label" IS 'Human-readable label for the block, shown in admin UI (e.g., "Pause déjeuner").';

COMMENT ON COLUMN "public"."venue_blocked_slots"."days_of_week" IS 'Days when this block applies. NULL means all days. Uses PostgreSQL DOW convention: 0=Sunday, 1=Monday, ..., 6=Saturday.';

ALTER TABLE ONLY "public"."venue_blocked_slots"
    ADD CONSTRAINT "venue_blocked_slots_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_blocked_slots_hotel_active" ON "public"."venue_blocked_slots" USING "btree" ("hotel_id") WHERE ("is_active" = true);

ALTER TABLE "public"."venue_blocked_slots" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."venue_blocked_slots" TO "anon";

GRANT ALL ON TABLE "public"."venue_blocked_slots" TO "authenticated";

GRANT ALL ON TABLE "public"."venue_blocked_slots" TO "service_role";
