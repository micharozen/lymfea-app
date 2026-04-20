/**
 * Client-side slug generator that mirrors the DB `public.slugify()` function.
 * unaccent → lowercase → non-alnum to "-" → collapse repeats → trim → truncate 60.
 */
export function slugify(input: string | null | undefined): string {
  if (!input) return "";
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
