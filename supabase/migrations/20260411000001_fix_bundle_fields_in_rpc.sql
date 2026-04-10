-- Fix: include is_bundle and bundle_id in get_public_treatments RPC
-- so the client flow can identify bundle treatments and display them correctly

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
  variants jsonb,
  is_bundle boolean,
  bundle_id uuid
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
    COALESCE(tc.is_addon, false) AS is_addon,
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
    ) AS variants,
    COALESCE(t.is_bundle, false) AS is_bundle,
    t.bundle_id
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
