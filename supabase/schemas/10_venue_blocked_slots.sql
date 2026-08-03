CREATE TABLE IF NOT EXISTS "public"."venue_blocked_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hotel_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "days_of_week" integer[],
    "block_date" "date",
    "room_id" "uuid",
    "group_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "blocked_slot_time_order" CHECK (("start_time" < "end_time")),
    CONSTRAINT "blocked_slot_dated_xor_recurring" CHECK ((("block_date" IS NULL) OR ("days_of_week" IS NULL)))
);

ALTER TABLE "public"."venue_blocked_slots" OWNER TO "postgres";

COMMENT ON TABLE "public"."venue_blocked_slots" IS 'Defines time ranges when a venue cannot accept bookings (e.g., lunch breaks). Slots falling within these ranges are filtered out of check-availability results.';

COMMENT ON COLUMN "public"."venue_blocked_slots"."label" IS 'Human-readable label for the block, shown in admin UI (e.g., "Pause déjeuner").';

COMMENT ON COLUMN "public"."venue_blocked_slots"."days_of_week" IS 'Days when this block applies. NULL means all days. Uses PostgreSQL DOW convention: 0=Sunday, 1=Monday, ..., 6=Saturday.';

COMMENT ON COLUMN "public"."venue_blocked_slots"."block_date" IS 'NULL = blocage récurrent hebdomadaire (days_of_week fait foi). Renseigné = blocage ponctuel sur cette date locale du lieu, days_of_week ignoré. Tout lecteur doit filtrer explicitement sur cette colonne.';

COMMENT ON COLUMN "public"."venue_blocked_slots"."room_id" IS 'NULL = le blocage porte sur tout le lieu. Renseigné = il ne porte que sur cette salle de soin, les autres restent réservables.';

COMMENT ON COLUMN "public"."venue_blocked_slots"."group_id" IS 'Regroupe les lignes créées ensemble (multi-salles et/ou multi-jours) pour un affichage et une suppression en bloc côté admin.';

ALTER TABLE ONLY "public"."venue_blocked_slots"
    ADD CONSTRAINT "venue_blocked_slots_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."venue_blocked_slots"
    ADD CONSTRAINT "venue_blocked_slots_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."treatment_rooms"("id") ON DELETE CASCADE;

CREATE INDEX "idx_blocked_slots_hotel_active" ON "public"."venue_blocked_slots" USING "btree" ("hotel_id") WHERE ("is_active" = true);

CREATE INDEX "idx_blocked_slots_hotel_date" ON "public"."venue_blocked_slots" USING "btree" ("hotel_id", "block_date") WHERE ("block_date" IS NOT NULL);

CREATE INDEX "idx_blocked_slots_group" ON "public"."venue_blocked_slots" USING "btree" ("group_id") WHERE ("group_id" IS NOT NULL);

ALTER TABLE "public"."venue_blocked_slots" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."venue_blocked_slots" TO "anon";

GRANT ALL ON TABLE "public"."venue_blocked_slots" TO "authenticated";

GRANT ALL ON TABLE "public"."venue_blocked_slots" TO "service_role";
