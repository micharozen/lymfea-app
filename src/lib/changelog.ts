/**
 * Changelog entries for the public /changelog page.
 *
 * Each release is one JSON file in `src/content/changelog/` (one file per
 * release keeps the auto-generated PRs conflict-free). Files are bundled at
 * build time via `import.meta.glob`, so adding a file is the only step needed
 * to publish an entry.
 */

/** Localised string — every user-facing field ships FR and EN. */
export interface LocalizedText {
  fr: string;
  en: string;
}

export type ChangelogItemType = "new" | "improved" | "fixed";

export type ChangelogAudience = "admin" | "therapist" | "client";

export interface ChangelogItem {
  type: ChangelogItemType;
  audience: ChangelogAudience;
  title: LocalizedText;
  body: LocalizedText;
}

export interface ChangelogEntry {
  /** ISO date (YYYY-MM-DD) the release shipped. */
  date: string;
  /** URL-safe identifier, unique per entry. */
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  items: ChangelogItem[];
}

const modules = import.meta.glob<ChangelogEntry>("../content/changelog/*.json", {
  eager: true,
  import: "default",
});

/** All released entries, most recent first. */
export const changelogEntries: ChangelogEntry[] = Object.values(modules).sort((a, b) =>
  b.date.localeCompare(a.date),
);

/** Pick the caller's language from a localised field, falling back to English. */
export function localize(text: LocalizedText, language: string): string {
  return language.startsWith("fr") ? text.fr : text.en;
}
