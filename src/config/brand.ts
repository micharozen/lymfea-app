import brandConfig from './brand.json';

// TypeScript type derived from the JSON structure
export type BrandConfig = typeof brandConfig;

// Direct export for non-React contexts (utilities, constants)
export const brand = brandConfig;

// React hook for component usage
// Currently returns static config; using a hook allows future flexibility
// (e.g., loading config from server, multi-tenancy)
export function useBrand(): BrandConfig {
  return brandConfig;
}

// Logo imports — Vite requires static import paths for SVGs in src/assets/
import brandLogo from '@/assets/brand-logo.svg';
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
