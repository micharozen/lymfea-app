import { useEffect, useState, type ReactNode } from 'react';
import { BrandContext, setResolvedBrand } from './brand';
import type { BrandConfig, ResolvedFrontBrand } from './brandRuntime';
import { PLATFORM_BRAND, resolveBrandForHost } from './brandRuntime';
import { applyBrandToDocument } from './applyBrandToDocument';

interface BrandProviderProps {
  children: ReactNode;
}

/**
 * Resolves the brand from the hostname before the app renders.
 *
 * Rendering is held back until resolution settles — otherwise a Saoma domain
 * would flash the Eïa name, logo and colors on every cold load. Resolution is a
 * single indexed RPC and never fails loudly: on error it settles on the
 * platform brand.
 */
export function BrandProvider({ children }: BrandProviderProps) {
  const [resolved, setResolved] = useState<ResolvedFrontBrand | null>(null);

  useEffect(() => {
    let cancelled = false;

    resolveBrandForHost(window.location.hostname).then((next) => {
      if (cancelled) return;
      // Set the module-level brand BEFORE rendering, so non-React consumers
      // (utilities, constants) read the resolved value on their first call.
      setResolvedBrand(next);
      applyBrandToDocument(next);
      setResolved(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing to show yet: the brand decides the logo and colors of any splash we
  // could render here, so rendering one would defeat the purpose.
  if (!resolved) return null;

  return (
    <BrandContext.Provider value={resolved.config}>
      {children}
    </BrandContext.Provider>
  );
}

export { PLATFORM_BRAND };
export type { BrandConfig };
