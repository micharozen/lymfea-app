-- Per-treatment add-on relationship
-- Admins can mark a specific treatment as add-on-only (is_addon on treatment_menus)
-- and link add-on treatments to a parent via treatment_addons junction table.
-- This complements the category-level is_addon flag (treatment_categories.is_addon).

-- 1. Flag on treatment_menus
ALTER TABLE public.treatment_menus
  ADD COLUMN IF NOT EXISTS is_addon boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_treatment_menus_is_addon
  ON public.treatment_menus (hotel_id, is_addon)
  WHERE is_addon = true;

-- 2. Junction table: parent ↔ add-on (many-to-many within the same hotel)
CREATE TABLE IF NOT EXISTS public.treatment_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_treatment_id uuid NOT NULL
    REFERENCES public.treatment_menus(id) ON DELETE CASCADE,
  addon_treatment_id uuid NOT NULL
    REFERENCES public.treatment_menus(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treatment_addons_unique UNIQUE (parent_treatment_id, addon_treatment_id),
  CONSTRAINT treatment_addons_no_self CHECK (parent_treatment_id <> addon_treatment_id)
);

CREATE INDEX IF NOT EXISTS idx_treatment_addons_parent
  ON public.treatment_addons (parent_treatment_id);
CREATE INDEX IF NOT EXISTS idx_treatment_addons_addon
  ON public.treatment_addons (addon_treatment_id);

-- 3. RLS: admins of the parent's hotel CRUD, public read for client flow
ALTER TABLE public.treatment_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS treatment_addons_public_read ON public.treatment_addons;
CREATE POLICY treatment_addons_public_read
  ON public.treatment_addons
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS treatment_addons_admin_write ON public.treatment_addons;
CREATE POLICY treatment_addons_admin_write
  ON public.treatment_addons
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.treatment_menus tm
      WHERE tm.id = treatment_addons.parent_treatment_id
        AND public.has_role(auth.uid(), 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.treatment_menus tm
      WHERE tm.id = treatment_addons.parent_treatment_id
        AND public.has_role(auth.uid(), 'admin')
    )
  );

-- 4. Extend get_public_treatments to return per-treatment is_addon
DROP FUNCTION IF EXISTS public.get_public_treatments(text);

CREATE OR REPLACE FUNCTION public.get_public_treatments(_hotel_id text)
RETURNS TABLE(
  id uuid,
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
  variants jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.id,
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
  LEFT JOIN public.treatment_categories tc
    ON tc.name = t.category AND tc.hotel_id = t.hotel_id
  WHERE t.status = 'active'
    AND t.hotel_id = _hotel_id
  ORDER BY t.sort_order, t.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO service_role;

-- 5. RPC: list add-ons linked to a parent treatment (public read for client flow)
CREATE OR REPLACE FUNCTION public.get_public_treatment_addons(_parent_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  name_en text,
  description text,
  description_en text,
  category text,
  duration integer,
  price numeric,
  price_on_request boolean,
  image text,
  currency text,
  sort_order integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.id,
    t.name,
    t.name_en,
    t.description,
    t.description_en,
    t.category,
    t.duration,
    t.price,
    t.price_on_request,
    t.image,
    t.currency,
    ta.sort_order
  FROM public.treatment_addons ta
  JOIN public.treatment_menus t
    ON t.id = ta.addon_treatment_id
  WHERE ta.parent_treatment_id = _parent_id
    AND t.status = 'active'
  ORDER BY ta.sort_order, t.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_treatment_addons(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_treatment_addons(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_treatment_addons(uuid) TO service_role;
