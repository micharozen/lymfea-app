-- ==============================================================================
-- Migration : public_booking_customer_language
--
-- ManageBooking (page publique « Modifier ou annuler ») lisait bookings.language
-- pour choisir la langue de son SMS de replanification. Cette colonne n'est
-- qu'une dérivation par réservation (indicatif téléphonique au moment de la
-- création) qu'un chemin de création peut laisser à sa valeur par défaut : la
-- préférence durable du client vit sur customers.language, et c'est elle qui
-- fait foi pour toute communication — même règle que
-- supabase/functions/_shared/client-language.ts, appliquée par cancel-booking,
-- notify-booking-confirmed et trigger-new-booking-notifications.
--
-- La RPC publique n'exposait pas la fiche client : impossible d'appliquer la
-- règle côté page. On ajoute customer_language, sans rien retirer — language
-- reste exposée comme repli, exactement dans le rôle que lui donne
-- resolveClientLanguage(customer, booking).
--
-- Reprise à l'identique de 20260907140000_reschedule_guardrails.sql ; seuls
-- le LEFT JOIN customers, la colonne renvoyée et le GROUP BY changent.
-- (get_public_booking n'est pas reflétée dans supabase/schemas/ : ces migrations
-- restent sa seule définition, contrairement à ce qu'annonce l'en-tête de
-- 20260907140000.)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.get_public_booking(text);

CREATE FUNCTION public.get_public_booking(p_token text)
RETURNS TABLE (
  id uuid,
  booking_id bigint,
  booking_date date,
  booking_time text,
  client_first_name text,
  client_last_name text,
  phone text,
  client_email text,
  hotel_id text,
  hotel_name text,
  room_number text,
  total_price numeric,
  status text,
  language text,
  customer_language text,
  short_token text,
  payment_method text,
  payment_status text,
  card_brand text,
  card_last4 text,
  estimated_price numeric,
  reschedule_cutoff_hours numeric,
  booking_treatments jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    b.id,
    b.booking_id,
    b.booking_date,
    b.booking_time,
    b.client_first_name,
    b.client_last_name,
    b.phone,
    b.client_email,
    b.hotel_id::text,
    b.hotel_name,
    b.room_number,
    b.total_price,
    b.status,
    b.language,
    c.language,
    b.short_token,
    b.payment_method,
    b.payment_status,
    bpi.card_brand,
    bpi.card_last4,
    bpi.estimated_price,
    COALESCE(h.client_reschedule_cutoff_hours, 24),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', bt.id,
          'treatment_id', bt.treatment_id,
          'treatment', jsonb_build_object(
            'id', tm.id,
            'name', tm.name,
            -- Le nom du soin est la dernière chose que la page ne savait pas
            -- traduire : elle n'avait que le libellé FR.
            'name_en', tm.name_en,
            'duration', tm.duration,
            'price', tm.price
          )
        )
      ) FILTER (WHERE bt.id IS NOT NULL),
      '[]'::jsonb
    ) AS booking_treatments
  FROM public.bookings b
  LEFT JOIN public.hotels h ON h.id = b.hotel_id
  LEFT JOIN public.customers c ON c.id = b.customer_id
  LEFT JOIN public.booking_payment_infos bpi ON bpi.booking_id = b.id
  LEFT JOIN public.booking_treatments bt ON bt.booking_id = b.id
  LEFT JOIN public.treatment_menus tm ON tm.id = bt.treatment_id
  WHERE (p_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND b.id = p_token::uuid)
     OR b.short_token = p_token
  GROUP BY b.id, b.payment_status, c.language, bpi.card_brand, bpi.card_last4,
           bpi.estimated_price, h.client_reschedule_cutoff_hours;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_booking(text) TO anon, authenticated;
