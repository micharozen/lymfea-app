-- Soins réservables uniquement en interne (ex : « Spa Tea Time » à Buci).
--
-- Jusqu'ici un soin était soit `status = 'active'` (visible partout : flow client
-- public, admin, PWA thérapeute), soit `inactive` (invisible partout, y compris
-- pour la création de booking en interne). Il n'existait aucun moyen de garder un
-- soin réservable en interne tout en le masquant du flow client.
--
-- `bookable_online = false` couvre ce cas : le soin reste actif et proposable par
-- l'admin et le thérapeute, mais disparaît du menu public.

ALTER TABLE public.treatment_menus
  ADD COLUMN IF NOT EXISTS bookable_online boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN public.treatment_menus.bookable_online IS
  'False = soin réservable uniquement en interne (admin / PWA thérapeute) : masqué du flow client public et de l''API partenaire.';

-- `get_public_treatments` gagne un second paramètre : les surfaces internes
-- (PWA thérapeute) passent `true` pour voir aussi les soins internes. Le garde-fou
-- `auth.uid() IS NOT NULL` fait que le flow client — session invité en
-- localStorage, aucun JWT Supabase — ne peut pas les obtenir même en passant `true`.
DROP FUNCTION IF EXISTS public.get_public_treatments("text");

CREATE OR REPLACE FUNCTION public.get_public_treatments("_hotel_id" "text", "_include_internal" boolean DEFAULT false) RETURNS TABLE("id" "uuid", "slug" "text", "name" "text", "name_en" "text", "description" "text", "description_en" "text", "category" "text", "service_for" "text", "duration" integer, "price" numeric, "price_on_request" boolean, "lead_time" integer, "image" "text", "sort_order" integer, "currency" "text", "is_bestseller" boolean, "is_addon" boolean, "is_bundle" boolean, "bundle_id" "uuid", "available_days" integer[], "amenity_id" "uuid", "amenity_type" "text", "bookable_online" boolean, "variants" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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
    t.amenity_id,
    va.type AS amenity_type,
    t.bookable_online,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', v.id, 'label', v.label, 'label_en', v.label_en,
          'duration', v.duration, 'price', v.price,
          'price_on_request', v.price_on_request,
          'is_default', v.is_default, 'sort_order', v.sort_order,
          'guest_count', v.guest_count,
          'available_days', v.available_days
        ) ORDER BY v.sort_order, v.guest_count, v.duration
       )
       FROM public.treatment_variants v
       WHERE v.treatment_id = t.id AND v.status = 'active'),
      '[]'::jsonb
    ) AS variants
  FROM public.treatment_menus t
  LEFT JOIN public.treatment_categories tc
    ON tc.name = t.category AND tc.hotel_id = t.hotel_id
  LEFT JOIN public.venue_amenities va
    ON va.id = t.amenity_id
  WHERE t.status = 'active' AND t.hotel_id = _hotel_id
    AND (t.bookable_online OR (_include_internal AND auth.uid() IS NOT NULL))
  ORDER BY t.sort_order, t.name;
$$;

ALTER FUNCTION public.get_public_treatments("_hotel_id" "text", "_include_internal" boolean) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_public_treatments("_hotel_id" "text", "_include_internal" boolean) TO "anon";
GRANT ALL ON FUNCTION public.get_public_treatments("_hotel_id" "text", "_include_internal" boolean) TO "authenticated";
GRANT ALL ON FUNCTION public.get_public_treatments("_hotel_id" "text", "_include_internal" boolean) TO "service_role";
