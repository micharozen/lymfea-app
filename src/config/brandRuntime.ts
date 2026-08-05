// Runtime brand resolution: hostname → organization → brand.
//
// One build serves every brand. `brand.json` is no longer the brand, it is the
// LAST-RESORT fallback: on localhost, on an unregistered host, or when the
// lookup fails, the app keeps the platform brand and nothing breaks.
//
// The server side does the same thing from `organization_branding`
// (supabase/functions/_shared/brand-resolver.ts). This file only ever sees the
// public presentation fields exposed by `get_public_brand_by_host` — the email
// sender configuration deliberately never reaches the browser.

import { supabase } from '@/integrations/supabase/client';
import brandConfig from './brand.json';

export type BrandConfig = typeof brandConfig;

/** Row shape returned by the `get_public_brand_by_host` RPC. */
interface PublicBrandRow {
  organization_id: string;
  organization_slug: string;
  display_name: string | null;
  tagline_fr: string | null;
  tagline_en: string | null;
  website_url: string | null;
  powered_by_label: string | null;
  app_domain: string | null;
  contact_email: string | null;
  logo_url: string | null;
  og_image_url: string | null;
  color_primary: string | null;
  color_dark: string | null;
  pwa_therapist_name: string | null;
  pwa_therapist_short_name: string | null;
  pwa_admin_name: string | null;
  pwa_admin_short_name: string | null;
  onesignal_app_id: string | null;
}

export interface ResolvedFrontBrand {
  config: BrandConfig;
  organizationId: string | null;
  /** OneSignal App ID for this host; null keeps the build-time env value. */
  onesignalAppId: string | null;
}

export const PLATFORM_BRAND: ResolvedFrontBrand = {
  config: brandConfig,
  organizationId: null,
  onesignalAppId: null,
};

/**
 * Merge a branding row over brand.json, field by field.
 *
 * Falsy-coalescing (`||`) rather than `??`, so a field left empty in the admin
 * UI behaves like "not filled in" — same rule as the server resolver.
 */
function merge(row: PublicBrandRow): ResolvedFrontBrand {
  const fb = brandConfig;
  return {
    organizationId: row.organization_id,
    onesignalAppId: row.onesignal_app_id || null,
    config: {
      ...fb,
      name: row.display_name || fb.name,
      fullName: row.display_name || fb.fullName,
      tagline: {
        fr: row.tagline_fr || fb.tagline.fr,
        en: row.tagline_en || fb.tagline.en,
      },
      website: row.website_url || fb.website,
      appDomain: row.app_domain || fb.appDomain,
      poweredBy: {
        fr: row.powered_by_label || fb.poweredBy.fr,
        en: row.powered_by_label || fb.poweredBy.en,
      },
      legal: {
        ...fb.legal,
        contactEmail: row.contact_email || fb.legal.contactEmail,
      },
      logos: {
        ...fb.logos,
        primary: row.logo_url || fb.logos.primary,
        ogImage: row.og_image_url || fb.logos.ogImage,
      },
      colors: {
        primary: row.color_primary || fb.colors.primary,
        dark: row.color_dark || fb.colors.dark,
      },
      pwa: {
        therapist: {
          ...fb.pwa.therapist,
          name: row.pwa_therapist_name || fb.pwa.therapist.name,
          shortName: row.pwa_therapist_short_name || fb.pwa.therapist.shortName,
        },
        admin: {
          ...fb.pwa.admin,
          name: row.pwa_admin_name || fb.pwa.admin.name,
          shortName: row.pwa_admin_short_name || fb.pwa.admin.shortName,
        },
      },
    },
  };
}

/**
 * Resolve the brand for the current hostname.
 *
 * Never throws and never blocks the app: an unknown host, an offline database
 * or an RPC error all resolve to the platform brand.
 */
export async function resolveBrandForHost(host: string): Promise<ResolvedFrontBrand> {
  try {
    // The cast goes away once 20260805120000_organization_branding.sql is
    // applied and `supabase gen types` is re-run — the RPC does not exist in
    // the generated Database type yet.
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;

    const { data, error } = await rpc('get_public_brand_by_host', { _host: host });
    if (error) {
      console.warn('[brand] host lookup failed, keeping platform brand:', error.message);
      return PLATFORM_BRAND;
    }
    const row = (Array.isArray(data) ? data[0] : data) as PublicBrandRow | undefined;
    if (!row) return PLATFORM_BRAND;
    return merge(row);
  } catch (err) {
    console.warn('[brand] host lookup threw, keeping platform brand:', err);
    return PLATFORM_BRAND;
  }
}
