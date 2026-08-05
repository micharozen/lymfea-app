// Hydrates the document head with the resolved brand.
//
// index.html ships brand-neutral: a single build serves every domain, so the
// title, social preview and manifest cannot be baked in at build time. They are
// rewritten here, once, as soon as the hostname resolves.
//
// Known limit: crawlers that do not execute JS see the neutral `og:` tags. If
// link previews ever need to be brand-accurate, the fix is to rewrite index.html
// per Host in scripts/serve-prod.mjs — this file stays valid either way.

import type { ResolvedFrontBrand } from './brandRuntime';

function setMeta(selector: string, content: string): void {
  const el = document.querySelector<HTMLMetaElement>(selector);
  if (el) el.content = content;
}

/**
 * The PWA manifest is per-brand, so it cannot be a static file. Building it as
 * a Blob URL keeps one build serving every brand, at the cost of the manifest
 * being unavailable until JS runs (install prompts appear slightly later).
 */
function applyManifest(brand: ResolvedFrontBrand): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) return;

  const isAdmin = window.location.pathname.startsWith('/admin-pwa');
  const pwa = isAdmin ? brand.config.pwa.admin : brand.config.pwa.therapist;

  const manifest = {
    id: isAdmin ? '/admin-pwa/v1' : '/pwa/v2',
    name: pwa.name,
    short_name: pwa.shortName,
    description: pwa.description.fr,
    start_url: isAdmin ? '/admin-pwa?v=1' : '/pwa?v=2',
    scope: isAdmin ? '/admin-pwa' : '/',
    display: 'standalone',
    theme_color: brand.config.colors.dark,
    background_color: '#ffffff',
    icons: [
      { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
  link.href = URL.createObjectURL(blob);
}

export function applyBrandToDocument(brand: ResolvedFrontBrand): void {
  const { config } = brand;

  document.title = config.fullName;
  setMeta('meta[name="description"]', config.description.fr);
  setMeta('meta[name="author"]', config.name);
  setMeta('meta[name="apple-mobile-web-app-title"]', config.fullName);
  setMeta('meta[name="theme-color"]', config.colors.dark);

  setMeta('meta[property="og:title"]', config.fullName);
  setMeta('meta[property="og:description"]', config.description.fr);
  setMeta('meta[property="og:image"]', config.logos.ogImage);
  setMeta('meta[name="twitter:image"]', config.logos.ogImage);

  applyManifest(brand);
}
