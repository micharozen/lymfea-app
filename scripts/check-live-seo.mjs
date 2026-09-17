#!/usr/bin/env node
/**
 * Smoke-test the *deployed* marketing site.
 *
 * Why this exists: for weeks production served the bare SPA shell — no <h1>,
 * no text — because the Railway build command bypassed the prerenderer. Nothing
 * in the repo could catch it: the build was green, the code was right, only the
 * deployed artifact was wrong. This script asserts against the live URL, so the
 * same silent regression fails loudly.
 *
 * Usage: node scripts/check-live-seo.mjs [origin]   (default: https://saoma.io)
 */

import { MARKETING_ROUTES, SITE_ORIGIN } from "./marketing-routes.mjs";

const origin = (process.argv[2] || SITE_ORIGIN).replace(/\/$/, "");
const DEFAULT_MIN_WORDS = 250;

const failures = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);

/** Strip scripts/styles/tags and count what a crawler would read as text. */
const wordCount = (html) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

async function checkPage({ path, minWords = DEFAULT_MIN_WORDS }) {
  const url = `${origin}${path}`;
  let res;
  try {
    res = await fetch(url, { redirect: "manual" });
  } catch (err) {
    return fail(path, `unreachable (${err.message})`);
  }

  if (res.status !== 200) return fail(path, `HTTP ${res.status}, expected 200`);

  const html = await res.text();

  if (!/<h1[\s>]/i.test(html)) {
    fail(path, "no <h1> — the page is almost certainly the un-prerendered SPA shell");
  }

  const lang = html.match(/<html[^>]*\blang="([^"]*)"/i)?.[1];
  if (lang !== "fr") fail(path, `<html lang="${lang ?? "?"}">, expected "fr"`);

  const words = wordCount(html);
  if (words < minWords) fail(path, `${words} words, expected at least ${minWords}`);

  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  if (!title) fail(path, "empty or missing <title>");
}

async function checkFile(path, { mustContain } = {}) {
  const url = `${origin}${path}`;
  const res = await fetch(url).catch((err) => ({ status: 0, err }));
  if (res.status !== 200) return fail(path, `HTTP ${res.status || "unreachable"}, expected 200`);

  if (mustContain) {
    const body = await res.text();
    const missing = mustContain.filter((needle) => !body.includes(needle));
    if (missing.length) fail(path, `missing ${missing.length} entr(ies): ${missing.join(", ")}`);
  }
}

async function checkHsts() {
  const res = await fetch(`${origin}/`).catch(() => null);
  if (res && !res.headers.get("strict-transport-security")) {
    fail("/", "no Strict-Transport-Security header");
  }
}

/** The www → apex redirect lives in Cloudflare, outside this repo — verify it holds. */
async function checkWwwRedirect() {
  if (!origin.startsWith("https://saoma.io")) return;
  const res = await fetch("https://www.saoma.io/compare", { redirect: "manual" }).catch(() => null);
  if (!res) return fail("www", "unreachable");
  if (res.status !== 301) fail("www", `HTTP ${res.status}, expected 301`);
  const location = res.headers.get("location");
  if (location !== "https://saoma.io/compare") {
    fail("www", `redirects to ${location ?? "nothing"}, expected https://saoma.io/compare`);
  }
}

console.log(`[seo-check] ${origin} — ${MARKETING_ROUTES.length} pages`);

await Promise.all([
  ...MARKETING_ROUTES.map(checkPage),
  checkFile("/robots.txt"),
  checkFile("/llms.txt"),
  checkFile("/sitemap.xml", {
    mustContain: MARKETING_ROUTES.map(({ path }) => `${SITE_ORIGIN}${path}<`),
  }),
  checkHsts(),
  checkWwwRedirect(),
]);

if (failures.length) {
  console.error(`\n[seo-check] ${failures.length} failure(s):`);
  for (const line of failures) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log("[seo-check] all checks passed");
