import { brand } from "./brand.ts";

// The invoice ISSUER (émetteur) is the organization. These columns live on the
// `organizations` table; each field falls back to the platform-wide
// _shared/brand.json legal block when the organization has not been filled in.

export interface OrgLegal {
  commercial_name?: string | null;
  legal_name?: string | null;
  legal_form?: string | null;
  legal_capital?: string | null;
  siren?: string | null;
  siret?: string | null;
  rcs?: string | null;
  vat_number?: string | null;
  legal_address?: string | null;
  legal_postal_code?: string | null;
  legal_city?: string | null;
  legal_country?: string | null;
}

export interface ResolvedIssuer {
  /** Displayed at the top of the invoice — commercial name preferred. */
  issuerName: string;
  /** Raison sociale, used in the legal mentions (footer). */
  companyName: string;
  companyType: string;
  capital: string;
  siren: string;
  vatNumber: string;
  /** Single-line, comma-separated address (rendered with commas → line breaks). */
  address: string;
}

const composeAddress = (org: OrgLegal): string | null => {
  const street = org.legal_address?.trim();
  const cityLine = [org.legal_postal_code, org.legal_city]
    .filter(Boolean)
    .join(" ")
    .trim();
  const parts = [street, cityLine, org.legal_country?.trim()].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};

/**
 * Resolves the invoice issuer identity from an organization row, falling back
 * to brand.json per field so no invoice breaks before organizations are filled.
 */
export const resolveIssuerLegal = (
  org: OrgLegal | null | undefined,
): ResolvedIssuer => {
  const fb = brand.legal;
  return {
    issuerName: org?.commercial_name || org?.legal_name || fb.companyName,
    companyName: org?.legal_name || fb.companyName,
    companyType: org?.legal_form || fb.companyType,
    capital: org?.legal_capital || fb.capital,
    siren: org?.siren || fb.siren,
    vatNumber: org?.vat_number || fb.vatNumber,
    address: composeAddress(org ?? {}) || fb.address,
  };
};
