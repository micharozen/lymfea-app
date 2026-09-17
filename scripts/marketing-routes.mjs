/**
 * The marketing site's public routes — single source of truth.
 *
 * Both the prerenderer (`prerender-landing.mjs`) and the sitemap generator
 * (`generate-sitemap.mjs`) read this list, so a page can't be prerendered
 * without being declared to crawlers, or vice versa. `/support` was live and
 * prerendered for weeks while missing from the hand-written sitemap; that class
 * of drift is what this file removes.
 *
 * Keep the comparison slugs in sync with COMPETITORS in
 * `src/components/landing/compare/competitors.ts`.
 */

export const SITE_ORIGIN = "https://saoma.io";

const COMPARE_SLUGS = ["book4time", "mindbody", "booker", "zenoti", "fresha", "treatwell"];

// À garder en phase avec CUSTOMER_STORIES dans
// `src/components/landing/customers.ts`.
const CUSTOMER_SLUGS = ["hotel-de-buci", "cap-antibes-beach-hotel", "hotel-hana"];

/**
 * `path`       — public URL path, also the sitemap entry.
 * `out`        — file written under dist/, served at `path` by serve-prod.mjs.
 * `changefreq` / `priority` — sitemap hints only.
 * `minWords`   — override for pages that are thin by design; the default lives
 *                in check-live-seo.mjs.
 */
export const MARKETING_ROUTES = [
  { path: "/", out: "landing.html", changefreq: "weekly", priority: "1.0" },
  { path: "/tarifs", out: "tarifs.html", changefreq: "monthly", priority: "0.9" },
  { path: "/clients", out: "clients.html", changefreq: "monthly", priority: "0.7" },
  ...CUSTOMER_SLUGS.map((slug) => ({
    path: `/clients/${slug}`,
    out: `clients/${slug}.html`,
    changefreq: "monthly",
    priority: "0.5",
    // Gabarit d'attente tant que le témoignage n'est pas validé.
    minWords: 60,
  })),
  { path: "/compare", out: "compare.html", changefreq: "monthly", priority: "0.8" },
  ...COMPARE_SLUGS.map((slug) => ({
    path: `/compare/saoma-vs-${slug}`,
    out: `compare/saoma-vs-${slug}.html`,
    changefreq: "monthly",
    priority: "0.7",
  })),
  { path: "/changelog", out: "changelog.html", changefreq: "weekly", priority: "0.7" },
  // Mostly a contact form — no amount of copy would make it a content page.
  { path: "/support", out: "support.html", changefreq: "monthly", priority: "0.4", minWords: 150 },
  { path: "/terms", out: "terms.html", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", out: "privacy.html", changefreq: "yearly", priority: "0.3" },
];
