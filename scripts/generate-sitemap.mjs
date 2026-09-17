#!/usr/bin/env node
/**
 * Write dist/sitemap.xml from the shared marketing route list.
 *
 * Runs after every `vite build` (both the prerendering and the non-prerendering
 * variant), so the sitemap can never describe a different set of pages than the
 * one actually shipped.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MARKETING_ROUTES, SITE_ORIGIN } from "./marketing-routes.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = resolve(__dirname, "..", "dist");

const entries = MARKETING_ROUTES.map(
  ({ path, changefreq, priority }) => `  <url>
    <loc>${SITE_ORIGIN}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
).join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;

await mkdir(DIST_DIR, { recursive: true });
await writeFile(join(DIST_DIR, "sitemap.xml"), xml, "utf8");
console.log(`[sitemap] ${MARKETING_ROUTES.length} URLs → dist/sitemap.xml`);
