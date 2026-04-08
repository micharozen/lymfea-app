// Generates PWA manifest files from brand.json
// Run: node scripts/generate-manifests.js

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const brand = JSON.parse(readFileSync(join(rootDir, 'src/config/brand.json'), 'utf-8'));

const sharedIcons = [
  { src: "/pwa-64x64.png", sizes: "64x64", type: "image/png" },
  { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
  { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
];

// Therapist PWA manifest
const therapistManifest = {
  name: brand.pwa.therapist.name,
  short_name: brand.pwa.therapist.shortName,
  description: brand.pwa.therapist.description.fr,
  id: "/pwa/v2",
  theme_color: "#000000",
  background_color: "#ffffff",
  display: "standalone",
  orientation: "portrait",
  scope: "/",
  start_url: "/pwa?v=2",
  icons: sharedIcons
};

// Admin PWA manifest
const adminManifest = {
  name: brand.pwa.admin.name,
  short_name: brand.pwa.admin.shortName,
  description: brand.pwa.admin.description.fr,
  id: "/admin-pwa/v1",
  theme_color: "#000000",
  background_color: "#ffffff",
  display: "standalone",
  orientation: "portrait",
  scope: "/admin-pwa",
  start_url: "/admin-pwa?v=1",
  icons: sharedIcons
};

writeFileSync(
  join(rootDir, 'public/manifest.webmanifest'),
  JSON.stringify(therapistManifest, null, 2) + '\n'
);

writeFileSync(
  join(rootDir, 'public/admin-manifest.webmanifest'),
  JSON.stringify(adminManifest, null, 2) + '\n'
);

console.log('Generated manifest.webmanifest and admin-manifest.webmanifest from brand.json');
