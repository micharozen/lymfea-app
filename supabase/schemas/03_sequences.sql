CREATE SEQUENCE IF NOT EXISTS "public"."bookings_booking_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."bookings_booking_id_seq" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."invoice_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."invoice_number_seq" OWNER TO "postgres";

GRANT ALL ON SEQUENCE "public"."bookings_booking_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."bookings_booking_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."bookings_booking_id_seq" TO "service_role";

GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "service_role";
