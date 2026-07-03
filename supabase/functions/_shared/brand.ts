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

// Localized display name for the transactional sender. The address stays the
// same (parsed from brand.emails.from.transactional); only the name shown in
// the inbox is translated to match the email's language.
const TRANSACTIONAL_FROM_NAME: Record<'fr' | 'en', string> = {
  fr: 'Eïa Réservation',
  en: 'Eïa Booking',
};

/** `"<Localized name> <address>"` for the transactional sender in `lang`. */
export function transactionalFrom(lang: 'fr' | 'en'): string {
  const raw = brand.emails.from.transactional;
  const address = raw.match(/<([^>]+)>/)?.[1] ?? raw;
  return `${TRANSACTIONAL_FROM_NAME[lang]} <${address}>`;
}
