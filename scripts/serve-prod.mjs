#!/usr/bin/env node
/**
 * Production static server for the built `dist/`.
 *
 * Why not `serve -s dist`: this app ships TWO entry points — the marketing
 * landing (`landing.html`, prerendered into `/`, `/compare`, `/terms`, `/privacy`,
 * `/compare/saoma-vs-*`) and the SPA app (`index.html`, all other routes). A single
 * SPA fallback (`-s` → every path to index.html) makes `/` serve the app shell,
 * which is Eïa-branded and declares the PWA manifest — so crawlers see the wrong
 * title and the manifest "E" icon as the site favicon. `serve.json` rewrites can't
 * express "SPA-fallback everything EXCEPT the marketing files" (serve-handler applies
 * rewrites recursively, so a `**` rule clobbers the specific ones).
 *
 * Routing:
 *   1. `/`                        → landing.html
 *   2. existing file w/ extension → that file (assets, favicons, *.html)
 *   3. extension-less w/ sibling  → `<path>.html` (clean URLs: /compare → compare.html)
 *   4. anything else              → index.html (SPA fallback for app routes)
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = resolve(__dirname, "..", "dist");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

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
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".map": "application/json",
};

const isFile = async (p) => {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
};

/** Resolve a request pathname to an absolute file in dist (or null on traversal). */
async function resolveFile(pathname) {
  if (pathname === "/" || pathname === "") {
    return join(DIST, "landing.html");
  }

  // Block path traversal: normalize and ensure the result stays inside dist.
  const safe = normalize(decodeURIComponent(pathname));
  const direct = join(DIST, safe);
  if (!direct.startsWith(DIST)) return null;

  const ext = extname(safe);

  if (ext) {
    // Real asset / explicit .html — serve if it exists, else 404.
    return (await isFile(direct)) ? direct : null;
  }

  // Clean URL: extension-less path with a prerendered sibling (e.g. /compare → compare.html).
  const html = `${direct}.html`;
  if (html.startsWith(DIST) && (await isFile(html))) return html;

  // SPA fallback — the app's client-side router handles the route.
  return join(DIST, "index.html");
}

function cacheControl(filePath) {
  // Vite emits content-hashed files under /assets — safe to cache forever.
  // HTML must revalidate so deploys are picked up.
  if (extname(filePath) === ".html") return "no-cache";
  if (filePath.includes(`${DIST}/assets/`)) return "public, max-age=31536000, immutable";
  return "public, max-age=3600";
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const filePath = await resolveFile(pathname);

    if (!filePath) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const data = await readFile(filePath);
    res.setHeader("Content-Type", MIME[extname(filePath)] ?? "application/octet-stream");
    res.setHeader("Cache-Control", cacheControl(filePath));
    res.statusCode = 200;
    res.end(data);
  } catch (err) {
    res.statusCode = 500;
    res.end("Internal server error");
    console.error("[serve-prod]", err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[serve-prod] serving ${DIST} at http://${HOST}:${PORT}`);
});
