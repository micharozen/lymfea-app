-- =============================================================================
-- Add concierges.organization_id (direct link to organizations)
-- =============================================================================
-- Until now concierges were scoped indirectly via concierge_hotels →
-- hotels.organization_id. This works, but allows a concierge to be linked to
-- hotels of two different orgs by accident. We add a direct organization_id on
-- concierges and enforce that every concierge_hotels row stays inside that org.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Column + FK + index
-- -----------------------------------------------------------------------------

ALTER TABLE public.concierges
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_concierges_organization_id
  ON public.concierges(organization_id);

-- -----------------------------------------------------------------------------
-- 2. Backfill from the first linked hotel (or Lymfea Default if none)
-- -----------------------------------------------------------------------------

UPDATE public.concierges c
SET organization_id = sub.organization_id
FROM (
  SELECT DISTINCT ON (ch.concierge_id)
    ch.concierge_id,
    h.organization_id
  FROM public.concierge_hotels ch
  JOIN public.hotels h ON h.id = ch.hotel_id
  ORDER BY ch.concierge_id, ch.created_at NULLS LAST
) sub
WHERE c.id = sub.concierge_id
  AND c.organization_id IS NULL;

UPDATE public.concierges
SET organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

ALTER TABLE public.concierges ALTER COLUMN organization_id SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Simplified scoping helper: use the direct column
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_can_access_concierge(_concierge_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.concierges c
      WHERE c.id = _concierge_id
        AND c.organization_id = public.get_user_organization_id(auth.uid())
    )
$$;

-- -----------------------------------------------------------------------------
-- 4. Enforce that concierge_hotels rows stay inside the concierge's org
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_concierge_hotel_same_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_concierge_org uuid;
  v_hotel_org uuid;
BEGIN
  SELECT organization_id INTO v_concierge_org FROM public.concierges WHERE id = NEW.concierge_id;
  SELECT organization_id INTO v_hotel_org FROM public.hotels WHERE id = NEW.hotel_id;

  IF v_concierge_org IS DISTINCT FROM v_hotel_org THEN
    RAISE EXCEPTION 'concierge_hotels: concierge org (%) does not match hotel org (%)',
      v_concierge_org, v_hotel_org;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS concierge_hotels_enforce_same_org ON public.concierge_hotels;
CREATE TRIGGER concierge_hotels_enforce_same_org
  BEFORE INSERT OR UPDATE ON public.concierge_hotels
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_concierge_hotel_same_org();

-- -----------------------------------------------------------------------------
-- 5. Auto-fill organization_id on concierges insert (same pattern as hotels)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_concierge_organization_id_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := COALESCE(
      public.get_user_organization_id(auth.uid()),
      'a0000000-0000-0000-0000-000000000001'::uuid
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS concierges_default_organization_id ON public.concierges;
CREATE TRIGGER concierges_default_organization_id
  BEFORE INSERT ON public.concierges
  FOR EACH ROW
  EXECUTE FUNCTION public.set_concierge_organization_id_default();

COMMENT ON COLUMN public.concierges.organization_id IS
  'Organization (tenant) the concierge belongs to. All concierge_hotels rows must reference hotels of the same org.';
