-- =========================================================================
-- Multi-tenant branding: resolve the brand per organization, at runtime
-- =========================================================================
-- Until now the brand was *compiled*: src/config/brand.json is injected into
-- index.html at build time, and its copy supabase/functions/_shared/brand.json
-- is statically imported by the edge functions. With a single Supabase project
-- for every client, a Saoma venue would send a booking confirmation signed
-- "Eïa", linking to app.eiaspa.fr, with an invoice under Eïa's SIREN.
--
-- Two tables fix that:
--   organization_branding  1:1 with organizations — every column NULLABLE so a
--                          missing value falls back to brand.json, field by
--                          field, exactly like _shared/issuer-legal.ts does for
--                          the invoice issuer.
--   organization_domains   N hosts → 1 organization. Adding a client is one row
--                          plus a CNAME — no build, no deploy.
--
-- Dedicated table rather than more columns on `organizations`: same reasoning as
-- venue_branding / venue_inbox_settings — organizations is read on nearly every
-- admin page and branding is only needed at boot and in edge functions.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. organization_branding
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_branding (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identity
  display_name text,
  tagline_fr text,
  tagline_en text,
  website_url text,
  powered_by_label text,

  -- Domain (canonical host used to build links in emails and push payloads)
  app_domain text,

  -- Email
  email_from_default text,
  email_from_transactional text,
  email_from_name_fr text,
  email_from_name_en text,
  contact_email text,
  admin_recipient_email text,

  -- Visual
  logo_url text,
  email_logo_url text,
  og_image_url text,
  color_primary text,
  color_dark text,

  -- PWA / push
  pwa_therapist_name text,
  pwa_therapist_short_name text,
  pwa_admin_name text,
  pwa_admin_short_name text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_branding IS
  '1:1 with organizations — brand resolved at runtime. Every column is nullable: a NULL falls back to brand.json, field by field (see _shared/brand-resolver.ts).';
COMMENT ON COLUMN public.organization_branding.app_domain IS
  'Canonical host for this brand (e.g. app.saoma.io). Used server-side to build links in emails and push notifications.';
COMMENT ON COLUMN public.organization_branding.email_from_default IS
  'RFC 5322 sender for transactional email, e.g. "Saoma <noreply@hello.saoma.io>". The domain MUST be verified in Resend (SPF/DKIM) or the send is rejected.';
COMMENT ON COLUMN public.organization_branding.email_from_name_fr IS
  'Localized display name for the transactional sender. The address comes from email_from_transactional; only the inbox-visible name is translated.';
COMMENT ON COLUMN public.organization_branding.powered_by_label IS
  'Replaces the "propulsé par Eïa" line in the email footer. NULL keeps the platform label.';

-- -------------------------------------------------------------------------
-- 2. organization_domains — this is what makes N domains possible
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_domains (
  host text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'app' CHECK (kind IN ('app', 'landing')),
  -- Per DOMAIN, not per organization: a OneSignal Web Push app is bound to a
  -- single origin. Eïa already proves it — app.eiaspa.fr and apptest.eiaspa.fr
  -- belong to the same organization but must use different apps.
  --
  -- Only domains that serve the PWA / admin need one. The client booking flow
  -- never initializes push (see EXCLUDED_PAGES in src/hooks/useOneSignal.ts),
  -- so a client-facing brand domain leaves this NULL.
  onesignal_app_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_domains_organization_id
  ON public.organization_domains(organization_id);

COMMENT ON TABLE public.organization_domains IS
  'Maps a hostname to an organization. One build serves every brand: the front resolves window.location.hostname through get_public_brand_by_host at boot.';
COMMENT ON COLUMN public.organization_domains.host IS
  'Lowercase hostname without scheme or port (e.g. app.saoma.io). Stored lowercase by trigger.';

-- Hostnames are case-insensitive; normalize on write so lookups never miss.
CREATE OR REPLACE FUNCTION public.organization_domains_normalize_host()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.host := LOWER(TRIM(NEW.host));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_domains_normalize_host ON public.organization_domains;
CREATE TRIGGER organization_domains_normalize_host
  BEFORE INSERT OR UPDATE ON public.organization_domains
  FOR EACH ROW EXECUTE FUNCTION public.organization_domains_normalize_host();

-- -------------------------------------------------------------------------
-- 3. updated_at trigger (reuses the shared set_updated_at from the
--    organizations migration)
-- -------------------------------------------------------------------------

DROP TRIGGER IF EXISTS organization_branding_set_updated_at ON public.organization_branding;
CREATE TRIGGER organization_branding_set_updated_at
  BEFORE UPDATE ON public.organization_branding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- 4. RLS — same shape as the organizations policies: super-admins manage
--    everything, org-admins read (and write) their own row only.
-- -------------------------------------------------------------------------

ALTER TABLE public.organization_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_domains ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['organization_branding', 'organization_domains'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Super admins manage branding', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.has_role(auth.uid(), ''admin''::public.app_role) AND public.is_super_admin(auth.uid())) '
      'WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role) AND public.is_super_admin(auth.uid()))',
      'Super admins manage branding', tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Org admins can view their branding', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING (public.has_role(auth.uid(), ''admin''::public.app_role) '
      '       AND organization_id = public.get_user_organization_id(auth.uid()))',
      'Org admins can view their branding', tbl
    );

    -- The client booking flow is anonymous and reads the brand through the
    -- security-definer RPC below, never through the table.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Block anonymous access to branding', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE TO anon USING (false)',
      'Block anonymous access to branding', tbl
    );

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
  END LOOP;
END $$;

-- Org-admins may edit their own branding (but not reassign it to another org).
DROP POLICY IF EXISTS "Org admins can update their branding" ON public.organization_branding;
CREATE POLICY "Org admins can update their branding" ON public.organization_branding
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND organization_id = public.get_user_organization_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND organization_id = public.get_user_organization_id(auth.uid())
  );

-- Domains stay super-admin only: a host is a platform-level routing decision
-- (DNS + Railway + OneSignal app), not something a client self-serves.

-- -------------------------------------------------------------------------
-- 5. Public RPC — the front resolves its brand before any authentication,
--    including on the anonymous client booking flow.
--    Returns zero rows for an unknown host; the caller then keeps brand.json.
-- -------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_public_brand_by_host(text);

CREATE FUNCTION public.get_public_brand_by_host(_host text)
RETURNS TABLE(
  "organization_id" uuid,
  "organization_slug" text,
  "display_name" text,
  "tagline_fr" text,
  "tagline_en" text,
  "website_url" text,
  "powered_by_label" text,
  "app_domain" text,
  "contact_email" text,
  "logo_url" text,
  "og_image_url" text,
  "color_primary" text,
  "color_dark" text,
  "pwa_therapist_name" text,
  "pwa_therapist_short_name" text,
  "pwa_admin_name" text,
  "pwa_admin_short_name" text,
  "onesignal_app_id" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    o.id,
    o.slug,
    COALESCE(b.display_name, o.name),
    b.tagline_fr,
    b.tagline_en,
    b.website_url,
    b.powered_by_label,
    b.app_domain,
    COALESCE(b.contact_email, o.contact_email),
    COALESCE(b.logo_url, o.logo_url),
    b.og_image_url,
    b.color_primary,
    b.color_dark,
    b.pwa_therapist_name,
    b.pwa_therapist_short_name,
    b.pwa_admin_name,
    b.pwa_admin_short_name,
    d.onesignal_app_id
  FROM public.organization_domains d
  JOIN public.organizations o ON o.id = d.organization_id
  LEFT JOIN public.organization_branding b ON b.organization_id = o.id
  WHERE d.host = LOWER(TRIM(_host));
$$;

COMMENT ON FUNCTION public.get_public_brand_by_host(text) IS
  'Resolves a hostname to its brand for the anonymous client flow and the app boot. Deliberately exposes only public presentation fields — never the email sender config, which stays server-side.';

GRANT EXECUTE ON FUNCTION public.get_public_brand_by_host(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_brand_by_host(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_brand_by_host(text) TO service_role;

-- -------------------------------------------------------------------------
-- 6. Seed the existing hosts onto the seed organization.
--    No branding row is created: every field would be NULL anyway, which is
--    exactly the brand.json fallback. Saoma's rows are inserted separately
--    once its Resend domain and OneSignal app exist.
-- -------------------------------------------------------------------------

-- onesignal_app_id deliberately left NULL: these two hosts share an
-- organization but NOT a OneSignal app, and the real full App IDs (UUIDs) must
-- be pasted from the OneSignal dashboard rather than guessed. NULL keeps the
-- current behaviour exactly — the front falls back to VITE_ONESIGNAL_APP_ID,
-- which is already set per deployment — so existing therapists keep their
-- subscription and nobody reinstalls anything.
INSERT INTO public.organization_domains (host, organization_id, kind)
VALUES
  ('app.eiaspa.fr',     'a0000000-0000-0000-0000-000000000001', 'app'),
  ('apptest.eiaspa.fr', 'a0000000-0000-0000-0000-000000000001', 'app')
ON CONFLICT (host) DO NOTHING;
