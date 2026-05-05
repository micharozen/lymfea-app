CREATE TABLE IF NOT EXISTS "public"."hotels" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "name" "text" NOT NULL,
    "image" "text",
    "address" "text",
    "city" "text",
    "country" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cover_image" "text",
    "postal_code" "text",
    "currency" "text" DEFAULT 'EUR'::"text",
    "vat" numeric(5,2) DEFAULT 20.00,
    "hotel_commission" numeric(5,2) DEFAULT 10.00,
    "therapist_commission" numeric(5,2) DEFAULT 70.00,
    "status" "text" DEFAULT 'active'::"text",
    "country_code" "text" DEFAULT 'FR'::"text",
    "timezone" "text" DEFAULT 'Europe/Paris'::"text",
    "venue_type" "text" DEFAULT 'hotel'::"text",
    "opening_time" time without time zone DEFAULT '06:00:00'::time without time zone,
    "closing_time" time without time zone DEFAULT '23:00:00'::time without time zone,
    "auto_validate_bookings" boolean DEFAULT false,
    "description" "text",
    "landing_subtitle" "text",
    "offert" boolean DEFAULT false,
    "pms_type" "text",
    "pms_auto_charge_room" boolean DEFAULT false,
    "pms_guest_lookup_enabled" boolean DEFAULT false,
    "slot_interval" integer DEFAULT 30,
    "company_offered" boolean DEFAULT false,
    "calendar_color" "text" DEFAULT '#3b82f6'::"text",
    "global_therapist_commission" boolean DEFAULT true,
    "allow_out_of_hours_booking" boolean DEFAULT false,
    "out_of_hours_surcharge_percent" numeric DEFAULT 0,
    "name_en" "text",
    "landing_subtitle_en" "text",
    "description_en" "text",
    "inter_venue_buffer_minutes" integer DEFAULT 0,
    "slug" "text" NOT NULL,
    "room_turnover_buffer_minutes" integer DEFAULT 0,
    "booking_hold_enabled" boolean DEFAULT true NOT NULL,
    "booking_hold_duration_minutes" integer DEFAULT 5 NOT NULL,
    "min_booking_notice_minutes" integer DEFAULT 0,
    CONSTRAINT "check_venue_hours" CHECK (("opening_time" < "closing_time")),
    CONSTRAINT "hotels_booking_hold_duration_range" CHECK ((("booking_hold_duration_minutes" >= 1) AND ("booking_hold_duration_minutes" <= 15))),
    CONSTRAINT "hotels_slug_pattern_check" CHECK ((("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text") AND (("length"("slug") >= 2) AND ("length"("slug") <= 60)))),
    CONSTRAINT "hotels_venue_type_check" CHECK (("venue_type" = ANY (ARRAY['hotel'::"text", 'spa'::"text"])))
);

ALTER TABLE "public"."hotels" OWNER TO "postgres";

COMMENT ON COLUMN "public"."hotels"."opening_time" IS 'Venue opening time for bookings (24h format)';

COMMENT ON COLUMN "public"."hotels"."closing_time" IS 'Venue closing time for bookings (24h format)';

COMMENT ON COLUMN "public"."hotels"."auto_validate_bookings" IS 'When true and only 1 active hairdresser is assigned to the venue, bookings are automatically confirmed without manual hairdresser validation';

COMMENT ON COLUMN "public"."hotels"."min_booking_notice_minutes" IS 'Délai minimum (en minutes) entre maintenant et l''heure du créneau réservable. 0 = pas de délai.';

ALTER TABLE ONLY "public"."hotels"
    ADD CONSTRAINT "hotels_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."hotels"
    ADD CONSTRAINT "hotels_slug_key" UNIQUE ("slug");

ALTER TABLE "public"."hotels" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."hotels" TO "anon";

GRANT ALL ON TABLE "public"."hotels" TO "authenticated";

GRANT ALL ON TABLE "public"."hotels" TO "service_role";
