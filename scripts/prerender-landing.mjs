#!/usr/bin/env node
/**
 * Prerender the landing page (/) into static HTML.
 *
 * Why: the landing is a Vite SPA — its <body> served from `dist/landing.html`
 * is just <div id="root"></div>. Googlebot can render JS but is slow; Bingbot,
 * LinkedIn, Slack, ChatGPT crawlers can't. This script boots a headless Chrome
 * against the built `dist/`, waits for the React tree to hydrate, then writes
 * the fully-rendered DOM back into `dist/landing.html`.
 *
 * Runs after `vite build`. Output is bit-for-bit identical SPA assets, except
 * `landing.html` now contains the full Hero/Features/FAQ markup + JSON-LD.
 *
 * Requires: `puppeteer` (devDep).
 */

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, extname, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = resolve(__dirname, "..", "dist");
const LANDING_FILE = join(DIST_DIR, "landing.html");
const PORT = 4173;

// Marketing routes to prerender into static HTML. Each renders the landing SPA
// shell (landing.html → landing-main.tsx), lets React Router resolve the route,
// then snapshots the DOM into its own file. Keep the comparison slugs in sync
// with COMPETITORS in src/components/landing/compare/competitors.ts.
// NOTE: production hosting must serve these files at their paths (like `/` →
// landing.html). Without that routing, crawlers fall back to the SPA shell.
const COMPARE_SLUGS = ["book4time", "mindbody", "booker", "zenoti", "fresha", "treatwell"];
const ROUTES = [
  { path: "/", out: "landing.html" },
  { path: "/compare", out: "compare.html" },
  ...COMPARE_SLUGS.map((slug) => ({
    path: `/compare/saoma-vs-${slug}`,
    out: `compare/saoma-vs-${slug}.html`,
  })),
  { path: "/terms", out: "terms.html" },
  { path: "/privacy", out: "privacy.html" },
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".map": "application/json",
};

function serveDist() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      let pathname = decodeURIComponent(url.pathname);

      // Serve `/` and any non-asset path from landing.html (SPA fallback to landing entry).
      const ext = extname(pathname);
      if (pathname === "/" || pathname === "" || !ext) {
        pathname = "/landing.html";
      }

      const filePath = join(DIST_DIR, pathname);
      if (!existsSync(filePath)) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }

      const data = await readFile(filePath);
      res.setHeader("Content-Type", MIME[extname(filePath)] ?? "application/octet-stream");
      res.end(data);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });

  return new Promise((resolveListen) => {
    server.listen(PORT, () => resolveListen(server));
  });
}

async function prerender() {
  if (!existsSync(LANDING_FILE)) {
    console.error("[prerender] dist/landing.html not found — run `vite build` first.");
    process.exit(1);
  }

  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    console.error("[prerender] puppeteer not installed. Run: bun add -d puppeteer");
    process.exit(1);
  }

  const server = await serveDist();
  console.log(`[prerender] serving dist/ at http://localhost:${PORT}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Surface page errors so build failures explain themselves.
    page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        console.log(`[prerender:page:${type}]`, msg.text());
      }
    });
    page.on("pageerror", (err) => {
      console.log("[prerender:pageerror]", err.message);
    });

    // Force French rendering — primary SEO target.
    await page.setExtraHTTPHeaders({ "Accept-Language": "fr-FR,fr;q=0.9" });

    // Block external requests (Plausible, fonts CDN) — they aren't needed for prerender
    // and Plausible 404s slow down `networkidle0`.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith(`http://localhost:${PORT}`) || url.startsWith("data:")) {
        req.continue();
      } else {
        req.abort();
      }
    });

    for (const route of ROUTES) {
      await page.goto(`http://localhost:${PORT}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Ensure an H1 is present — sanity check that React mounted & routed.
      await page.waitForSelector("h1", { timeout: 20000 });

      // Give framer-motion whileInView a head start (harmless if already done).
      await new Promise((r) => setTimeout(r, 500));

      const html = await page.content();

      // Sanity: bail if the rendered HTML is suspiciously small (React failed).
      if (html.length < 5000) {
        throw new Error(
          `[${route.path}] Rendered HTML too small (${html.length} bytes) — likely a hydration error.`,
        );
      }

      const outFile = join(DIST_DIR, route.out);
      await mkdir(dirname(outFile), { recursive: true });
      await writeFile(outFile, html, "utf8");
      console.log(`[prerender] ${route.path} → ${route.out} (${html.length} bytes)`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

prerender().catch((err) => {
  console.error("[prerender] failed:", err);
  process.exit(1);
});
