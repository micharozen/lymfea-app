// Brand configuration for Edge Functions (Deno runtime)
// Source of truth: src/config/brand.json — keep in sync via `npm run sync:brand`
import brandConfig from './brand.json' with { type: 'json' };

export const brand = brandConfig;
export type BrandConfig = typeof brandConfig;

// Full URL for email logo (hosted in Supabase Storage bucket "assets").
// The Saoma leaf mark (public/images/saoma.png) — replaces the legacy OOM logo.
export const EMAIL_LOGO_URL = 'https://xfkujlgettlxdgrnqluw.supabase.co/storage/v1/object/public/assets/saoma.png';

// Base URL for the email icon set (hosted PNGs — inline SVG is stripped by
// Gmail). Source files live in docs/email-icons/; upload them to the "assets"
// bucket under email-icons/ so these URLs resolve. Referenced as
// `${EMAIL_ICON_BASE}/icon-<name>.png`.
export const EMAIL_ICON_BASE = 'https://xfkujlgettlxdgrnqluw.supabase.co/storage/v1/object/public/assets/email-icons';

/**
 * `"<Localized name> <address>"` for the platform transactional sender.
 *
 * Only correct for sends that belong to no client (platform invitations,
 * support). Anything venue-scoped must go through `transactionalFromFor()` in
 * brand-resolver.ts so the client's own sender is used.
 */
export function transactionalFrom(lang: 'fr' | 'en'): string {
  const raw = brand.emails.from.transactional;
  const address = raw.match(/<([^>]+)>/)?.[1] ?? raw;
  return `${brand.emails.fromName[lang]} <${address}>`;
}
