// Resolves the brand for a given venue or organization, at runtime.
//
// The brand used to be compiled in: every function imported _shared/brand.json
// statically, so a Saoma venue would send a confirmation signed "Eïa" linking
// to app.eiaspa.fr. Here the brand comes from `organization_branding`, with
// brand.json as the LAST-RESORT fallback — field by field, the same way
// _shared/issuer-legal.ts resolves the invoice issuer.
//
// Unlike stripe-resolver.ts, falling back is deliberate and safe: serving the
// platform brand is degraded, never dangerous, so nothing throws here. A venue
// whose organization has no branding row simply keeps the platform brand.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand, EMAIL_LOGO_URL } from "./brand.ts";

/** Branding rarely changes; long enough to spare the DB, short enough to see edits. */
const CACHE_TTL_MS = 60_000;

/** A venue never changes organization in practice — cache the mapping longer. */
const HOTEL_ORG_TTL_MS = 10 * 60_000;

export type BrandLang = "fr" | "en";

export interface ResolvedBrand {
  /** Null when resolved without any venue/org context (platform brand). */
  organizationId: string | null;
  name: string;
  /** Canonical host, WITHOUT scheme — e.g. "app.saoma.io". */
  appDomain: string;
  website: string;
  contactEmail: string;
  tagline: Record<BrandLang, string>;
  poweredBy: Record<BrandLang, string>;
  emails: {
    fromDefault: string;
    fromTransactional: string;
    fromName: Record<BrandLang, string>;
    adminRecipient: string;
  };
  /** Absolute URL of the logo used in email headers. */
  emailLogoUrl: string;
  colors: { primary: string; dark: string };
}

interface BrandingRow {
  display_name: string | null;
  tagline_fr: string | null;
  tagline_en: string | null;
  app_domain: string | null;
  website_url: string | null;
  powered_by_label: string | null;
  email_from_default: string | null;
  email_from_transactional: string | null;
  email_from_name_fr: string | null;
  email_from_name_en: string | null;
  contact_email: string | null;
  admin_recipient_email: string | null;
  email_logo_url: string | null;
  color_primary: string | null;
  color_dark: string | null;
}

const BRANDING_COLUMNS =
  "display_name, tagline_fr, tagline_en, app_domain, website_url, powered_by_label, email_from_default, " +
  "email_from_transactional, email_from_name_fr, email_from_name_en, contact_email, " +
  "admin_recipient_email, email_logo_url, color_primary, color_dark";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const orgCache = new Map<string, CacheEntry<ResolvedBrand>>();
const hotelOrgCache = new Map<string, CacheEntry<string | null>>();

/** The compiled brand.json, shaped as a ResolvedBrand. */
export function platformBrand(): ResolvedBrand {
  return {
    organizationId: null,
    name: brand.name,
    appDomain: brand.appDomain,
    website: brand.website,
    contactEmail: brand.legal.contactEmail,
    // brand.json flattens tagline to the EN string for the edge subset.
    tagline: { fr: brand.tagline, en: brand.tagline },
    poweredBy: brand.poweredBy,
    emails: {
      fromDefault: brand.emails.from.default,
      fromTransactional: brand.emails.from.transactional,
      fromName: brand.emails.fromName,
      adminRecipient: brand.emails.adminRecipient,
    },
    emailLogoUrl: EMAIL_LOGO_URL,
    colors: brand.colors,
  };
}

/**
 * Merge an organization's branding row over the platform brand.
 *
 * Falsy-coalescing (`||`) rather than `??` on purpose: an empty string left in
 * the admin UI must behave like "not filled in", exactly as resolveIssuerLegal
 * treats it.
 */
function mergeBranding(
  organizationId: string,
  row: BrandingRow | null,
): ResolvedBrand {
  const fb = platformBrand();
  if (!row) return { ...fb, organizationId };

  return {
    organizationId,
    name: row.display_name || fb.name,
    appDomain: row.app_domain || fb.appDomain,
    website: row.website_url || fb.website,
    contactEmail: row.contact_email || fb.contactEmail,
    tagline: {
      fr: row.tagline_fr || fb.tagline.fr,
      en: row.tagline_en || fb.tagline.en,
    },
    poweredBy: {
      fr: row.powered_by_label || fb.poweredBy.fr,
      en: row.powered_by_label || fb.poweredBy.en,
    },
    emails: {
      fromDefault: row.email_from_default || fb.emails.fromDefault,
      fromTransactional: row.email_from_transactional || fb.emails.fromTransactional,
      fromName: {
        fr: row.email_from_name_fr || fb.emails.fromName.fr,
        en: row.email_from_name_en || fb.emails.fromName.en,
      },
      adminRecipient: row.admin_recipient_email || fb.emails.adminRecipient,
    },
    emailLogoUrl: row.email_logo_url || fb.emailLogoUrl,
    colors: {
      primary: row.color_primary || fb.colors.primary,
      dark: row.color_dark || fb.colors.dark,
    },
  };
}

async function organizationIdForHotel(
  supabase: SupabaseClient,
  hotelId: string,
): Promise<string | null> {
  const cached = hotelOrgCache.get(hotelId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data, error } = await supabase
    .from("hotels")
    .select("organization_id")
    .eq("id", hotelId)
    .maybeSingle();

  if (error) {
    console.error(`[brand-resolver] hotel=${hotelId} org lookup failed:`, error.message);
    return null;
  }

  const organizationId = data?.organization_id ?? null;
  hotelOrgCache.set(hotelId, {
    value: organizationId,
    expiresAt: Date.now() + HOTEL_ORG_TTL_MS,
  });
  return organizationId;
}

async function resolveByOrganization(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ResolvedBrand> {
  const cached = orgCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data, error } = await supabase
    .from("organization_branding")
    .select(BRANDING_COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    // Degraded, not broken: keep the platform brand and don't cache the miss.
    console.error(`[brand-resolver] org=${organizationId} branding read failed:`, error.message);
    return { ...platformBrand(), organizationId };
  }

  const resolved = mergeBranding(organizationId, (data as BrandingRow | null) ?? null);
  orgCache.set(organizationId, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
  return resolved;
}

/**
 * Resolve the brand from a venue or an organization.
 *
 * With neither, returns the platform brand — correct for platform-level sends
 * (admin invitations, support tickets) that belong to no client.
 */
export async function resolveBrand(
  supabase: SupabaseClient,
  scope: { hotelId?: string | null; organizationId?: string | null },
): Promise<ResolvedBrand> {
  if (scope.organizationId) {
    return await resolveByOrganization(supabase, scope.organizationId);
  }

  if (scope.hotelId) {
    const organizationId = await organizationIdForHotel(supabase, scope.hotelId);
    if (organizationId) return await resolveByOrganization(supabase, organizationId);
    console.warn(`[brand-resolver] hotel=${scope.hotelId} has no organization — platform brand`);
  }

  return platformBrand();
}

/** `"<Localized name> <address>"` for the transactional sender in `lang`. */
export function transactionalFromFor(resolved: ResolvedBrand, lang: BrandLang): string {
  const raw = resolved.emails.fromTransactional;
  const address = raw.match(/<([^>]+)>/)?.[1] ?? raw;
  return `${resolved.emails.fromName[lang]} <${address}>`;
}

/**
 * Base URL for links embedded in emails and push payloads.
 *
 * Deliberately does NOT read SITE_URL. That variable has a different, unrelated
 * job: _shared/stripe-oauth.ts builds the Stripe OAuth redirect URI from it, and
 * that URI must match saoma/stripe-app.json exactly — so SITE_URL must stay set
 * in production. Reusing it here would pin every brand to app.eiaspa.fr and
 * defeat the whole point.
 *
 * SITE_URL_OVERRIDE is the staging escape hatch: staging is single-domain, so
 * it pins every brand to apptest.eiaspa.fr. Leave it unset in production.
 */
export function siteUrlFor(resolved: ResolvedBrand): string {
  const override = Deno.env.get("SITE_URL_OVERRIDE");
  if (override) return override.replace(/\/+$/, "");
  return `https://${resolved.appDomain}`;
}

export function clearBrandCache(organizationId?: string) {
  if (organizationId) {
    orgCache.delete(organizationId);
  } else {
    orgCache.clear();
    hotelOrgCache.clear();
  }
}
