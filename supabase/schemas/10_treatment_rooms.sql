CREATE TABLE IF NOT EXISTS "public"."treatment_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "room_type" "text" NOT NULL,
    "room_number" "text" NOT NULL,
    "image" "text",
    "hotel_id" "text",
    "hotel_name" "text",
    "next_booking" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "capacity" integer DEFAULT 1,
    "capabilities" "text"[] DEFAULT '{}'::"text"[]
);

ALTER TABLE "public"."treatment_rooms" OWNER TO "postgres";

COMMENT ON COLUMN "public"."treatment_rooms"."capabilities" IS 'Array of treatment types this room supports (e.g. Massage, Facial, Hammam). Replaces the single room_type field.';

COMMENT ON COLUMN "public"."treatment_rooms"."capacity" IS 'Nombre de clients pouvant etre accueillis ensemble dans une meme reservation (duo/trio). Une salle deja reservee ne peut pas etre partagee avec une autre reservation.';

ALTER TABLE ONLY "public"."treatment_rooms"
    ADD CONSTRAINT "treatment_rooms_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_treatment_rooms_capabilities" ON "public"."treatment_rooms" USING "gin" ("capabilities");

ALTER TABLE "public"."treatment_rooms" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."treatment_rooms" TO "anon";

GRANT ALL ON TABLE "public"."treatment_rooms" TO "authenticated";

GRANT ALL ON TABLE "public"."treatment_rooms" TO "service_role";
