// Brand configuration for Edge Functions (Deno runtime)
// Source of truth: src/config/brand.json — keep in sync via `npm run sync:brand`
import brandConfig from './brand.json' with { type: 'json' };

export const brand = brandConfig;
export type BrandConfig = typeof brandConfig;
