// Brand configuration for the Hono backend (Bun/Node runtime)
// Source of truth: src/config/brand.json (frontend) — keep in sync.
// Inlined here so the backend Docker image doesn't depend on files outside its
// own src/ tree (the Dockerfile only copies backend/src).

export const brand = {
  name: "Eïa",
  fullName: "Eïa – Centre Holistique",
  website: "https://lymfea.fr",
  appDomain: "app.lymfea.fr",
} as const;

export type BrandConfig = typeof brand;

// Full URL for email logo (hosted in Supabase Storage bucket "assets")
export const EMAIL_LOGO_URL =
  "https://xfkujlgettlxdgrnqluw.supabase.co/storage/v1/object/public/assets/brand-logo-email.png";
