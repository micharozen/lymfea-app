-- =========================================================================
-- Gateway customers API: list venue customers + per-customer booking history
-- =========================================================================
-- Exposes two SECURITY DEFINER RPCs consumed by the public /v1 API:
--
--   gateway_list_venue_customers(_hotel_id, _limit, _offset)
--   gateway_list_customer_bookings(_customer_id, _hotel_id, _limit, _offset)
--
-- Both filter strictly by hotel_id (text) — tenant isolation is enforced
-- upstream in backend/src/routes/v1/customers.ts which resolves the slug to
-- a hotels.id only after asserting hotels.organization_id === apiKey.organizationId.
--
-- Stats are computed per venue: a customer who books at two venues will have
-- two distinct (booking_count, total_spent_amount, last_visit_date) tuples.
--
-- "Spent" filters payment_status to actually-collected revenue:
--   paid | charged_to_room | charged
-- (excludes pending, awaiting_payment, refunded, expired, pending_*).
-- =========================================================================

-- 1. List customers of a venue with aggregated stats.
CREATE OR REPLACE FUNCTION public.gateway_list_venue_customers(
  _hotel_id TEXT,
  _limit    INT DEFAULT 50,
  _offset   INT DEFAULT 0
)
RETURNS TABLE (
  id                       UUID,
  first_name               TEXT,
  last_name                TEXT,
  email                    TEXT,
  phone                    TEXT,
  language                 TEXT,
  preferred_treatment_type TEXT,
  profile_completed        BOOLEAN,
  booking_count            BIGINT,
  last_visit_date          DATE,
  total_spent_amount       TEXT,
  currency                 TEXT,
  created_at               TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ,
  total_count              BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH venue_bookings AS (
    SELECT
      customer_id,
      COUNT(*)                                                 AS booking_count,
      MAX(booking_date)                                        AS last_visit_date,
      COALESCE(SUM(total_price) FILTER (
        WHERE payment_status IN ('paid', 'charged_to_room', 'charged')
      ), 0)                                                    AS total_spent_amount
    FROM bookings
    WHERE hotel_id = _hotel_id
      AND customer_id IS NOT NULL
    GROUP BY customer_id
  ),
  venue AS (
    SELECT currency FROM hotels WHERE id = _hotel_id
  )
  SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.email,
    c.phone,
    c.language,
    c.preferred_treatment_type,
    c.profile_completed,
    vb.booking_count,
    vb.last_visit_date,
    to_char(vb.total_spent_amount, 'FM999999990.00') AS total_spent_amount,
    (SELECT currency FROM venue)                     AS currency,
    c.created_at,
    c.updated_at,
    COUNT(*) OVER ()                                 AS total_count
  FROM customers c
  JOIN venue_bookings vb ON vb.customer_id = c.id
  ORDER BY vb.last_visit_date DESC NULLS LAST, c.id
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.gateway_list_venue_customers(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gateway_list_venue_customers(TEXT, INT, INT) TO service_role;

COMMENT ON FUNCTION public.gateway_list_venue_customers(TEXT, INT, INT) IS
  'Public /v1 API: lists customers who have booked at a given venue, with per-venue aggregated stats. Tenant isolation enforced in the calling API route by resolving the venue slug to hotel_id only after org-scope assertion.';

-- 2. List the bookings of a customer within a given venue.
--
-- A booking can hold N treatments (booking_treatments is many-to-one). Each
-- treatment in the array represents the actual booked variant. Variant
-- fields come strictly from treatment_variants; `name` comes from the parent
-- treatment_menus row (variants do not carry their own name).
--
-- `total_price` is the canonical amount stored on `bookings` at booking
-- time. It usually equals `SUM(treatments[].price.amount)` but may diverge
-- when surcharges (e.g. out-of-hours), discounts or vouchers are applied
-- — callers should treat `total_price` as authoritative for billing.
CREATE OR REPLACE FUNCTION public.gateway_list_customer_bookings(
  _customer_id UUID,
  _hotel_id    TEXT,
  _limit       INT DEFAULT 20,
  _offset      INT DEFAULT 0
)
RETURNS TABLE (
  id             UUID,
  booking_number INT,
  booking_date   DATE,
  booking_time   TIME,
  duration       INT,
  status         TEXT,
  payment_method TEXT,
  payment_status TEXT,
  client_type    TEXT,
  total_price    TEXT,
  currency       TEXT,
  room_number    TEXT,
  treatments     JSONB,
  created_at     TIMESTAMPTZ,
  total_count    BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH venue AS (
    SELECT currency FROM hotels WHERE id = _hotel_id
  )
  SELECT
    b.id,
    b.booking_id                                AS booking_number,
    b.booking_date,
    b.booking_time,
    b.duration,
    b.status,
    b.payment_method,
    b.payment_status,
    b.client_type,
    to_char(b.total_price, 'FM999999990.00')    AS total_price,
    (SELECT currency FROM venue)                AS currency,
    b.room_number,
    COALESCE(t.treatments, '[]'::jsonb)         AS treatments,
    b.created_at,
    COUNT(*) OVER ()                            AS total_count
  FROM bookings b
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               -- Variant id when present, NULL for legacy rows that lack one.
               'id',       tv.id,
               -- Menu join via bt.treatment_id (always set) — variant has no name.
               'name',     tm.name,
               'label',    tv.label,
               'duration', tv.duration,
               'price',    CASE
                             WHEN tv.price IS NULL THEN NULL
                             ELSE jsonb_build_object(
                               'amount',   to_char(tv.price, 'FM999999990.00'),
                               'currency', (SELECT currency FROM venue)
                             )
                           END
             )
             ORDER BY bt.created_at
           ) AS treatments
    FROM booking_treatments bt
    LEFT JOIN treatment_menus    tm ON tm.id = bt.treatment_id
    LEFT JOIN treatment_variants tv ON tv.id = bt.variant_id
    WHERE bt.booking_id = b.id
  ) t ON true
  WHERE b.hotel_id    = _hotel_id
    AND b.customer_id = _customer_id
  ORDER BY b.booking_date DESC, b.booking_time DESC, b.id
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.gateway_list_customer_bookings(UUID, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gateway_list_customer_bookings(UUID, TEXT, INT, INT) TO service_role;

COMMENT ON FUNCTION public.gateway_list_customer_bookings(UUID, TEXT, INT, INT) IS
  'Public /v1 API: lists a customer''s booking history within a single venue. The exposed "treatment" is the booked variant (variant_id surfaced as the canonical id, menu name preserved as a stable label). Falls back to the treatment_menus row when variant_id is NULL. Tenant isolation enforced upstream.';
