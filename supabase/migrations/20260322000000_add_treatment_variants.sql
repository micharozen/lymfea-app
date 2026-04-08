-- ============================================================
-- Treatment Variants: allow multiple duration/price options per treatment
-- (Apple/Tesla configurator style)
-- ============================================================

-- 1. Create treatment_variants table
CREATE TABLE public.treatment_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_id UUID NOT NULL REFERENCES public.treatment_menus(id) ON DELETE CASCADE,
  label TEXT,
  duration INTEGER NOT NULL,
  price NUMERIC(10,2),
  price_on_request BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by treatment
CREATE INDEX idx_treatment_variants_treatment_id ON public.treatment_variants(treatment_id);

-- 2. Migrate existing treatment data → one variant per treatment
INSERT INTO public.treatment_variants (treatment_id, label, duration, price, price_on_request, is_default, sort_order)
SELECT
  id AS treatment_id,
  duration || ' min' AS label,
  COALESCE(duration, 60) AS duration,
  price,
  COALESCE(price_on_request, false) AS price_on_request,
  true AS is_default,
  0 AS sort_order
FROM public.treatment_menus
WHERE status = 'active';

-- 3. Add variant_id to booking_treatments
ALTER TABLE public.booking_treatments
ADD COLUMN variant_id UUID REFERENCES public.treatment_variants(id);

-- 4. Backfill variant_id for existing booking_treatments
-- (link each booking_treatment to the default variant of its treatment)
UPDATE public.booking_treatments bt
SET variant_id = tv.id
FROM public.treatment_variants tv
WHERE tv.treatment_id = bt.treatment_id
  AND tv.is_default = true;

-- 5. RLS policies for treatment_variants
ALTER TABLE public.treatment_variants ENABLE ROW LEVEL SECURITY;

-- Public read (needed for client booking flow)
CREATE POLICY "Anyone can read active treatment variants"
  ON public.treatment_variants FOR SELECT
  USING (status = 'active');

-- Admin/service can manage
CREATE POLICY "Authenticated users can manage treatment variants"
  ON public.treatment_variants FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. Update get_public_treatments to include variants as JSON array
DROP FUNCTION IF EXISTS public.get_public_treatments(text);

CREATE OR REPLACE FUNCTION public.get_public_treatments(_hotel_id text)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
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
  variants jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.id,
    t.name,
    t.description,
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
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'label', v.label,
            'duration', v.duration,
            'price', v.price,
            'price_on_request', v.price_on_request,
            'is_default', v.is_default,
            'sort_order', v.sort_order
          ) ORDER BY v.sort_order, v.duration
        )
        FROM public.treatment_variants v
        WHERE v.treatment_id = t.id
          AND v.status = 'active'
      ),
      '[]'::jsonb
    ) AS variants
  FROM public.treatment_menus t
  WHERE t.status = 'active'
    AND t.hotel_id = _hotel_id
  ORDER BY t.sort_order, t.name;
$$;
