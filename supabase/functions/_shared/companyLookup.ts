/**
 * French company lookup by SIREN against the public recherche-entreprises API.
 * Shared by lookup-company (admin) and venue-setup (public onboarding wizard).
 */

const API_URL = "https://recherche-entreprises.api.gouv.fr/search";

// Most common French legal form codes (INSEE "catégories juridiques").
// The API only returns the numeric code; we resolve the common ones and
// fall back to the raw code for anything else.
const LEGAL_FORM_LABELS: Record<string, string> = {
  "5410": "SARL",
  "5498": "EURL",
  "5499": "SARL",
  "5505": "SA",
  "5510": "SA",
  "5710": "SAS",
  "5720": "SASU",
  "5785": "SAS",
  "6540": "SCI",
  "1000": "Entrepreneur individuel",
};

/**
 * Computes the French intra-community VAT number from a SIREN.
 * FR + key + SIREN, where key = (12 + 3 * (SIREN mod 97)) mod 97, zero-padded.
 */
function computeVatNumber(siren: string): string {
  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${siren}`;
}

export interface CompanyResult {
  commercial_name: string | null;
  legal_name: string | null;
  legal_form: string | null;
  siren: string;
  siret: string | null;
  rcs: string | null;
  vat_number: string;
  legal_address: string | null;
  legal_postal_code: string | null;
  legal_city: string | null;
  legal_country: string;
}

export type CompanyLookup =
  | { ok: true; company: CompanyResult }
  | { ok: false; error: "invalid_siren" | "lookup_failed" | "not_found"; status: number };

export async function lookupCompanyBySiren(rawSiren: unknown): Promise<CompanyLookup> {
  const siren = String(rawSiren ?? "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(siren)) {
    return { ok: false, error: "invalid_siren", status: 400 };
  }

  const url = `${API_URL}?q=${siren}&per_page=1`;
  const apiRes = await fetch(url, { headers: { Accept: "application/json" } });
  if (!apiRes.ok) {
    console.error("[company-lookup] API error", apiRes.status);
    return { ok: false, error: "lookup_failed", status: 502 };
  }

  const data = await apiRes.json();
  const match = (data.results ?? []).find(
    (r: { siren?: string }) => r.siren === siren,
  );
  if (!match) return { ok: false, error: "not_found", status: 404 };

  const siege = match.siege ?? {};
  const formCode: string | null = match.nature_juridique ?? null;

  return {
    ok: true,
    company: {
      commercial_name: match.nom_complet ?? null,
      legal_name: match.nom_raison_sociale ?? match.nom_complet ?? null,
      legal_form: formCode ? (LEGAL_FORM_LABELS[formCode] ?? formCode) : null,
      siren,
      siret: siege.siret ?? null,
      // In France the RCS registration number is the SIREN; the greffe city is
      // the head-office commune.
      rcs: siege.libelle_commune
        ? `${siren} RCS ${siege.libelle_commune}`
        : siren,
      vat_number: computeVatNumber(siren),
      legal_address:
        [siege.numero_voie, siege.type_voie, siege.libelle_voie]
          .filter(Boolean)
          .join(" ") || null,
      legal_postal_code: siege.code_postal ?? null,
      legal_city: siege.libelle_commune ?? null,
      legal_country: "France",
    },
  };
}
