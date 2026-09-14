/**
 * Client minimal pour l'API REST de Twenty (CRM).
 * Seule la création de lead est exposée : c'est le seul usage côté formulaires publics.
 */

/** Valeurs techniques autorisées par le SELECT `source` côté Twenty. */
export type TwentyLeadSource =
  | "WEBSITE_FORM"
  | "INBOUND_CALL"
  | "REFERRAL"
  | "EVENT"
  | "LINKEDIN"
  | "COLD_OUTREACH"
  | "OTHER";

export interface CreateLeadInput {
  name?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  message?: string;
  /** Défaut Twenty si omis : NEW. */
  source?: TwentyLeadSource;
  submittedAt?: string;
}

const DEFAULT_API_URL = "https://crm.saoma.io/rest";

/**
 * Crée un lead dans Twenty. Ne lève jamais : le CRM ne doit pas faire échouer
 * le traitement principal (envoi d'email) du formulaire appelant.
 */
export async function createTwentyLead(
  input: CreateLeadInput,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get("TWENTY_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "TWENTY_API_KEY not configured" };
  }

  const baseUrl = (Deno.env.get("TWENTY_API_URL") || DEFAULT_API_URL).replace(/\/$/, "");

  // Tous les champs sont facultatifs côté Twenty : on n'envoie que ceux renseignés,
  // et une valeur inconnue dans un SELECT ferait échouer la requête en 400.
  const body: Record<string, unknown> = {};
  if (input.name) body.name = input.name;
  if (input.companyName) body.companyName = input.companyName;
  if (input.email) body.email = { primaryEmail: input.email };
  if (input.phone) body.phone = { primaryPhoneNumber: input.phone };
  if (input.message) body.message = input.message;
  if (input.source) body.source = input.source;
  if (input.submittedAt) body.submittedAt = input.submittedAt;

  try {
    const res = await fetch(`${baseUrl}/leads`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return { ok: false, error: `${res.status} ${await res.text()}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
