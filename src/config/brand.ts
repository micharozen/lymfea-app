import { createContext, useContext } from 'react';
import brandConfig from './brand.json';
import type { BrandConfig, ResolvedFrontBrand } from './brandRuntime';
import { PLATFORM_BRAND } from './brandRuntime';

export type { BrandConfig };

// The brand is resolved once at boot from the hostname (see BrandProvider).
// Until then — and on localhost, or on any host not registered in
// organization_domains — this stays brand.json.
let current: ResolvedFrontBrand = PLATFORM_BRAND;

/** Called once by BrandProvider, before the app renders. */
export function setResolvedBrand(next: ResolvedFrontBrand): void {
  current = next;
}

/** Current brand, for non-React contexts (utilities, constants, i18n). */
export function getBrand(): BrandConfig {
  return current.config;
}

/** Full resolution result, including the organization and its OneSignal app. */
export function getResolvedBrand(): ResolvedFrontBrand {
  return current;
}

/**
 * Direct export for non-React contexts.
 *
 * A Proxy rather than a plain object: ~45 modules already do `brand.name` at
 * call time, and a live view onto the resolved brand keeps every one of them
 * correct without touching them. A plain `export const` would freeze the value
 * to brand.json at import time.
 */
export const brand: BrandConfig = new Proxy({} as BrandConfig, {
  get: (_target, prop) => Reflect.get(current.config, prop),
  has: (_target, prop) => Reflect.has(current.config, prop),
  ownKeys: () => Reflect.ownKeys(current.config),
  getOwnPropertyDescriptor: (_target, prop) => ({
    ...Reflect.getOwnPropertyDescriptor(current.config, prop),
    configurable: true,
  }),
});

export const BrandContext = createContext<BrandConfig>(brandConfig);

/** React hook for component usage — re-renders when the brand resolves. */
export function useBrand(): BrandConfig {
  return useContext(BrandContext);
}

// Logo imports — Vite requires static import paths for SVGs in src/assets/.
// These stay platform assets: a client brand overrides its logo through the
// `logo_url` column, which is a URL rather than a bundled file.
import brandLogo from '@/assets/21.png';
import brandMonogram from '@/assets/brand-monogram.svg';
import brandMonogramWhite from '@/assets/brand-monogram-white.svg';
import brandMonogramBlack from '@/assets/brand-monogram-black.svg';
import brandMonogramWhiteClient from '@/assets/brand-monogram-white-client.svg';

export const brandLogos = {
  primary: brandLogo,
  monogram: brandMonogram,
  monogramWhite: brandMonogramWhite,
  monogramBlack: brandMonogramBlack,
  monogramWhiteClient: brandMonogramWhiteClient,
} as const;
