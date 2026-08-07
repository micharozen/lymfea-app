// L'identité juridique portée par une facture — organisation ou lieu — vient de
// `billing_profiles`. Aucun repli sur _shared/brand.json : un champ vide reste
// vide plutôt que d'emprunter les mentions d'une autre entité juridique (une
// facture ne doit jamais mélanger deux sociétés).

export interface BillingProfileLegal {
  commercial_name?: string | null;
  company_name?: string | null;
  legal_form?: string | null;
  legal_capital?: string | null;
  siren?: string | null;
  siret?: string | null;
  tva_number?: string | null;
  billing_address?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
  billing_country?: string | null;
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

const clean = (value: string | null | undefined): string => value?.trim() || "";

export const composeBillingAddress = (
  profile: BillingProfileLegal | null | undefined,
): string => {
  const cityLine = [profile?.billing_postal_code, profile?.billing_city]
    .map((p) => clean(p))
    .filter(Boolean)
    .join(" ");
  return [clean(profile?.billing_address), cityLine, clean(profile?.billing_country)]
    .filter(Boolean)
    .join(", ");
};

/**
 * Resolves an invoice party identity from its billing profile. Missing fields
 * come back as empty strings — the caller omits the corresponding line.
 */
export const resolveIssuerLegal = (
  profile: BillingProfileLegal | null | undefined,
): ResolvedIssuer => {
  const companyName = clean(profile?.company_name);
  return {
    issuerName: clean(profile?.commercial_name) || companyName,
    companyName,
    companyType: clean(profile?.legal_form),
    capital: clean(profile?.legal_capital),
    siren: clean(profile?.siren) || clean(profile?.siret).slice(0, 9),
    vatNumber: clean(profile?.tva_number),
    address: composeBillingAddress(profile),
  };
};
