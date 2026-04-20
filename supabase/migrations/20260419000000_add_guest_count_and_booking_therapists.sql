-- Migration: Add guest_count to treatment variants & bookings,
-- create booking_therapists bridge table for multi-person treatments.

-- 1. guest_count on treatment variants (how many guests this variant serves)
ALTER TABLE treatment_variants
  ADD COLUMN guest_count integer NOT NULL DEFAULT 1;

-- 2. guest_count on bookings (how many therapists are required)
ALTER TABLE bookings
  ADD COLUMN guest_count integer NOT NULL DEFAULT 1;

-- 3. Bridge table: booking <-> therapists (replaces 1:1 therapist_id)
CREATE TABLE booking_therapists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  therapist_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assigned_at timestamptz,
  UNIQUE(booking_id, therapist_id)
);

CREATE INDEX idx_booking_therapists_booking ON booking_therapists(booking_id);
CREATE INDEX idx_booking_therapists_therapist ON booking_therapists(therapist_id);

-- RLS: admins full access, therapists can read their own, concierges can read for their hotels
ALTER TABLE booking_therapists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage booking_therapists"
  ON booking_therapists FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Therapists can view their own assignments"
  ON booking_therapists FOR SELECT
  TO authenticated
  USING (therapist_id = auth.uid());

CREATE POLICY "Concierges can view booking_therapists for their hotels"
  ON booking_therapists FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND EXISTS (
      SELECT 1
      FROM bookings b
      JOIN concierge_hotels ch ON ch.hotel_id = b.hotel_id
      WHERE b.id = booking_therapists.booking_id
        AND ch.concierge_id = auth.uid()
    )
  );

-- 4. Migrate existing bookings into the bridge table
INSERT INTO booking_therapists (booking_id, therapist_id, status, assigned_at)
SELECT id, therapist_id, 'accepted', assigned_at
FROM bookings
WHERE therapist_id IS NOT NULL;

-- 5. Update get_public_treatments RPC to include guest_count in variants
DROP FUNCTION IF EXISTS public.get_public_treatments(text);

CREATE OR REPLACE FUNCTION public.get_public_treatments(_hotel_id text)
RETURNS TABLE(
  id uuid,
  slug text,
  name text,
  name_en text,
  description text,
  description_en text,
  category text,
  service_for text,
  duration integer,
  price numeric,
  price_on_request boolean,
  lead_time integer,
  image text,
  sort_order integer,
  currency text,
  is_bestseller boolean,
  is_addon boolean,
  is_bundle boolean,
  bundle_id uuid,
  variants jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.id,
    t.slug,
    t.name,
    t.name_en,
    t.description,
    t.description_en,
    t.category,
    t.service_for,
    t.duration,
    t.price,
    t.price_on_request,
    t.lead_time,
    t.image,
    t.sort_order,
    t.currency,
    t.is_bestseller,
    (COALESCE(t.is_addon, false) OR COALESCE(tc.is_addon, false)) AS is_addon,
    COALESCE(t.is_bundle, false) AS is_bundle,
    t.bundle_id,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'label', v.label,
            'label_en', v.label_en,
            'duration', v.duration,
            'price', v.price,
            'price_on_request', v.price_on_request,
            'is_default', v.is_default,
            'sort_order', v.sort_order,
            'guest_count', v.guest_count
          ) ORDER BY v.sort_order, v.guest_count, v.duration
        )
        FROM public.treatment_variants v
        WHERE v.treatment_id = t.id
          AND v.status = 'active'
      ),
      '[]'::jsonb
    ) AS variants
  FROM public.treatment_menus t
  LEFT JOIN public.treatment_categories tc
    ON tc.name = t.category AND tc.hotel_id = t.hotel_id
  WHERE t.status = 'active'
    AND t.hotel_id = _hotel_id
  ORDER BY t.sort_order, t.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO service_role;
