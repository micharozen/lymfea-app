#!/usr/bin/env node
// Projects src/config/brand.json onto the subset the edge functions need.
//
// This used to be `cp src/config/brand.json supabase/functions/_shared/brand.json`.
// The two files drifted anyway — the front carried lymfea.fr while the edge
// carried the real production sender (hello.eiaspa.fr) — so a blind copy would
// have silently overwritten the production email configuration.
//
// Projecting instead of copying means the front file is the single source of
// truth and the two can no longer disagree. The edge subset stays small on
// purpose: brand.json is now only the LAST-RESORT fallback, used when an
// organization has no branding row (see _shared/brand-resolver.ts).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(root, 'src/config/brand.json');
const TARGET = resolve(root, 'supabase/functions/_shared/brand.json');

const brand = JSON.parse(readFileSync(SOURCE, 'utf8'));

// Keys the edge functions actually read. Anything else stays front-only.
const projected = {
  name: brand.name,
  tagline: brand.tagline.en,
  fullName: brand.fullName,
  description: brand.description,
  website: brand.website,
  appDomain: brand.appDomain,
  poweredBy: brand.poweredBy,
  legal: brand.legal,
  emails: brand.emails,
  logos: brand.logos,
  colors: brand.colors,
  pwa: brand.pwa,
  storageKeys: brand.storageKeys,
};

const missing = Object.entries(projected)
  .filter(([, value]) => value === undefined)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`[sync-brand] missing key(s) in ${SOURCE}: ${missing.join(', ')}`);
  process.exit(1);
}

writeFileSync(TARGET, `${JSON.stringify(projected, null, 2)}\n`, 'utf8');
console.log(`[sync-brand] wrote ${TARGET}`);
