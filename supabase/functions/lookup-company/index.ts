import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Computes the French intra-community VAT number from a SIREN.
 * FR + key + SIREN, where key = (12 + 3 * (SIREN mod 97)) mod 97, zero-padded.
 */
function computeVatNumber(siren: string): string {
  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${siren}`;
}

interface CompanyResult {
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: authenticated admin only -------------------------------------
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return jsonResponse({ error: "unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "invalid_authentication" }, 401);
    }

    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) return jsonResponse({ error: "forbidden" }, 403);

    // --- Input: SIREN (9 digits) --------------------------------------------
    const body = await req.json().catch(() => ({}));
    const siren = String(body.siren ?? "").replace(/\s/g, "");
    if (!/^\d{9}$/.test(siren)) {
      return jsonResponse({ error: "invalid_siren" }, 400);
    }

    // --- Lookup against the public gouv API ---------------------------------
    const url = `${API_URL}?q=${siren}&per_page=1`;
    const apiRes = await fetch(url, { headers: { Accept: "application/json" } });
    if (!apiRes.ok) {
      console.error("[lookup-company] API error", apiRes.status);
      return jsonResponse({ error: "lookup_failed" }, 502);
    }

    const data = await apiRes.json();
    const match = (data.results ?? []).find(
      (r: { siren?: string }) => r.siren === siren,
    );
    if (!match) return jsonResponse({ error: "not_found" }, 404);

    const siege = match.siege ?? {};
    const formCode: string | null = match.nature_juridique ?? null;

    const result: CompanyResult = {
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
    };

    return jsonResponse({ success: true, company: result });
  } catch (err) {
    console.error("[lookup-company] error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "unknown_error" },
      500,
    );
  }
});
