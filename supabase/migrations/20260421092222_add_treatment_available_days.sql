-- Ajout de la colonne
ALTER TABLE public.treatment_menus
ADD COLUMN available_days integer[] DEFAULT NULL;

COMMENT ON COLUMN public.treatment_menus.available_days IS
  'Jours autorisés : 0=Dim, 1=Lun, ..., 6=Sam. NULL = disponible tous les jours.';

-- Mise à jour de la RPC publique pour exposer le nouveau champ
DROP FUNCTION IF EXISTS public.get_public_treatments(text);

CREATE OR REPLACE FUNCTION public.get_public_treatments(_hotel_id text)
RETURNS TABLE(
  id uuid, slug text, name text, name_en text,
  description text, description_en text,
  category text, service_for text,
  duration integer, price numeric, price_on_request boolean,
  lead_time integer, image text, sort_order integer,
  currency text, is_bestseller boolean, is_addon boolean,
  is_bundle boolean, bundle_id uuid,
  available_days integer[],
  variants jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.id, t.slug, t.name, t.name_en,
    t.description, t.description_en,
    t.category, t.service_for,
    t.duration, t.price, t.price_on_request,
    t.lead_time, t.image, t.sort_order,
    t.currency, t.is_bestseller,
    (COALESCE(t.is_addon, false) OR COALESCE(tc.is_addon, false)) AS is_addon,
    COALESCE(t.is_bundle, false) AS is_bundle,
    t.bundle_id,
    t.available_days,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', v.id, 'label', v.label, 'label_en', v.label_en,
          'duration', v.duration, 'price', v.price,
          'price_on_request', v.price_on_request,
          'is_default', v.is_default, 'sort_order', v.sort_order,
          'guest_count', v.guest_count
        ) ORDER BY v.sort_order, v.guest_count, v.duration
       )
       FROM public.treatment_variants v
       WHERE v.treatment_id = t.id AND v.status = 'active'),
      '[]'::jsonb
    ) AS variants
  FROM public.treatment_menus t
  LEFT JOIN public.treatment_categories tc
    ON tc.name = t.category AND tc.hotel_id = t.hotel_id
  WHERE t.status = 'active' AND t.hotel_id = _hotel_id
  ORDER BY t.sort_order, t.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_treatments(text) TO service_role;
