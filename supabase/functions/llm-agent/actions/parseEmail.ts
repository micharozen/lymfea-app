// Claude Haiku parser for inbound emails. Extracts structured booking intent
// from free-text email bodies (FR + EN), including emails forwarded by a hotel
// concierge.

import { callAnthropic, safeParseJsonObject } from "../../_shared/anthropic-client.ts";

export interface TreatmentVariantRef {
  id: string;
  treatment_id: string;
  label: string | null;
  label_en: string | null;
  duration: number | null;
  guest_count: number | null;
  is_default: boolean;
}

export interface TreatmentRef {
  id: string;
  name: string | null;
  name_en: string | null;
  duration: number | null;
  category: string | null;
  /** Complement that cannot be booked on its own (own flag OR its category's). */
  is_addon: boolean;
  variants: TreatmentVariantRef[];
}

export interface TreatmentCandidate {
  id: string | null;
  confidence: number;
  reason: string | null;
}

export interface ParsedEmail {
  client_first_name: string | null;
  client_last_name: string | null;
  client_civility: "madame" | "monsieur" | null;
  email: string | null;
  phone: string | null;
  requested_date: string | null;
  /**
   * Toutes les dates proposées, dans l'ordre de préférence exprimé par le
   * client. Un « lundi ou mardi » en donne deux : la disponibilité tranchera.
   */
  requested_dates: string[];
  requested_time: string | null;
  treatment_match: { id: string | null; confidence: number } | null;
  treatment_candidates: TreatmentCandidate[];
  variant_match: { id: string | null; confidence: number } | null;
  guest_count: number | null;
  /** Titre court et actionnable, destiné à nommer la tâche de suivi. */
  summary: string | null;
  notes: string | null;
  intent_confidence: number;
  detected_language: string | null;
}

export interface ParseEmailInput {
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  fromAddress: string;
  venueName: string | null;
  treatments: TreatmentRef[];
}

export interface ParseEmailResult {
  parsed: ParsedEmail | null;
  rawModelResponse: string | null;
  error: string | null;
}

const SYSTEM_PROMPT = `You are a booking intent extractor for a spa management platform (Eïa).
You receive emails sent to a venue's inbound address. Some are direct client requests, others are forwarded by a hotel concierge.

Rules:
- Treat forwarded emails (containing "---------- Forwarded message ----------" or "De :" / "From:" blocks) as if the original sender is the client. Extract the ORIGINAL sender's name/email/phone, not the forwarder.
- Always output a single JSON object matching the schema below. No prose, no markdown, no code fences.
- Use null when a field is genuinely missing. Never invent data.
- requested_dates lists EVERY date the client is open to, in ISO YYYY-MM-DD, ordered by their stated preference ("Monday June 15th or Tuesday June 16th" → both dates, Monday first). Resolve relative dates like "demain" or "next Friday" using today's date provided in the user message. Use [] when no date is mentioned. Never invent a date.
- requested_date is the first entry of requested_dates, or null when that list is empty. Do not drop the other dates: a client offering two options has not chosen, and availability will decide.
- requested_time must be HH:mm 24h.
- treatment_candidates must contain the 1 or 2 most relevant treatments from the provided treatment list, sorted by relevance. Each id must be one of the provided treatment IDs. Use [] if no treatment is plausible. Include a short reason based on the email wording.
- Duration matching runs on the VARIANT durations listed under each treatment, never on the treatment's own "duration=" field — that one is only the default variant. A treatment qualifies for "a 90 minute massage" as soon as ONE of its variants lasts 90 minutes, whatever its default duration. Check every variant of every treatment before ruling one out.
- When several treatments offer the requested duration and the email names no technique, modality or body area (e.g. "a 90 minute massage", "un massage d'une heure"), return them ALL as candidates (up to 2) and cap every confidence at 0.5. A duration is not an intent: the client did not choose between a hot stone massage and a Swedish massage, so we must not choose for them. Reserve confidence above 0.7 for an email that names the treatment, the technique or the body area.
- Treatments flagged "ADD-ON" are complements that CANNOT be booked on their own (they are supplements to a base treatment). NEVER put an add-on in treatment_candidates and never use one as treatment_match — not even when the email seems to match only an add-on, and not even as a "least committal" fallback. If the client explicitly asks for something that only exists as an add-on, mention it in notes and pick the closest bookable base treatment instead (or [] if none fits).
- treatment_match is the best candidate from treatment_candidates for backward compatibility. If treatment_candidates is empty, treatment_match.id must be null. treatment_match.confidence in 0..1 reflects match quality.
- variant_match.id must be one of the variant IDs listed UNDER the chosen treatment, or null. Pick a variant when the email specifies a duration (e.g. "60 minutes", "1h30") and/or a guest_count (e.g. "pour 2 personnes", "duo"). Match by closest duration AND matching guest_count; prefer the variant whose duration equals the requested duration and whose guest_count matches the requested guest_count. If only one of the two is specified, use the one that's specified and ignore the other. If no variant fits, return null.
- summary is a short, actionable title for the staff task that will track this request: who wants what, and when if known. Max 70 characters, no trailing period. Write it in the CLIENT's language (detected_language), naming the client rather than the person forwarding the message — e.g. "Massage 90 min duo — Eleanor Whitfield, lun 21 ou mar 22". It is a title, not a summary of your reasoning: never describe the email, the forwarding or your own analysis. Use null only when the email carries no intelligible request.
- notes is free-form context for the operator (ambiguities, constraints, anything that did not fit the schema). Never reuse it as a title.
- intent_confidence in 0..1 reflects how confident you are that this email is a genuine booking request (not spam, not a follow-up question, not a thank-you note).
- client_civility: "madame" or "monsieur", ONLY when the body or the signature states it explicitly for the client — a civility written in front of the name ("Mme Dupont", "M. Rozenblum", "Dear Madame Warner", "Mr. Wesley Martin", "Ms. Maher"), or an unambiguous self-description. NEVER infer it from a first name, and never take the civility of the forwarder or of a staff member. Use null in every other case, including any doubt.
- Never derive the civility from the email address: a local part such as "m.durand@…" or "jdupont@…" is an address, not a stated civility — "m." there is an initial, not "Monsieur". Only the message text can establish a civility. (Reading a plausible name out of the address is fine; reading a gender out of it is not.)
- detected_language: ISO 639-1 ("fr", "en", ...).

Schema:
{
  "client_first_name": string|null,
  "client_last_name": string|null,
  "client_civility": "madame"|"monsieur"|null,
  "email": string|null,
  "phone": string|null,
  "requested_date": string|null,
  "requested_dates": string[],
  "requested_time": string|null,
  "treatment_match": { "id": string|null, "confidence": number } | null,
  "treatment_candidates": Array<{ "id": string, "confidence": number, "reason": string|null }>,
  "variant_match": { "id": string|null, "confidence": number } | null,
  "guest_count": number|null,
  "summary": string|null,
  "notes": string|null,
  "intent_confidence": number,
  "detected_language": string|null
}`;

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildUserMessage(input: ParseEmailInput): string {
  const today = new Date().toISOString().slice(0, 10);
  const treatmentList = input.treatments
    .map(t => {
      const addon = t.is_addon ? " | ADD-ON (complement, never bookable alone)" : "";
      const head = `- id=${t.id} | name="${t.name ?? ""}" | name_en="${t.name_en ?? ""}" | duration=${t.duration ?? "?"}min | category=${t.category ?? "?"}${addon}`;
      if (!t.variants || t.variants.length === 0) return head;
      const variants = t.variants
        .map(v => `    · variant_id=${v.id} | label="${v.label ?? ""}" | label_en="${v.label_en ?? ""}" | duration=${v.duration ?? "?"}min | guests=${v.guest_count ?? "?"}${v.is_default ? " | default" : ""}`)
        .join("\n");
      return `${head}\n${variants}`;
    })
    .join("\n");

  const body = input.bodyText?.trim()
    || stripHtml(input.bodyHtml ?? "")
    || "(empty body)";

  return [
    `Today's date: ${today}`,
    `Venue name: ${input.venueName ?? "(unknown)"}`,
    `From: ${input.fromAddress}`,
    `Subject: ${input.subject ?? "(no subject)"}`,
    ``,
    `Available treatments at this venue:`,
    treatmentList || "(none)",
    ``,
    `Email body:`,
    body,
  ].join("\n");
}

export async function parseEmailWithLlm(input: ParseEmailInput): Promise<ParseEmailResult> {
  const { text, error } = await callAnthropic({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: buildUserMessage(input),
    maxTokens: 1024,
  });

  if (error) {
    return { parsed: null, rawModelResponse: null, error };
  }

  const raw = safeParseJsonObject<Partial<ParsedEmail>>(text);
  if (!raw) {
    return { parsed: null, rawModelResponse: text, error: "Model output was not valid JSON" };
  }

  // Add-ons are dropped defensively: the prompt already forbids them, this makes it
  // impossible for a drifting model to surface one as a bookable candidate.
  const variantIdsByTreatment = new Map(
    input.treatments
      .filter(t => !t.is_addon)
      .map(t => [t.id, new Set((t.variants ?? []).map(v => v.id))] as const),
  );

  return {
    parsed: normalize(raw, variantIdsByTreatment),
    rawModelResponse: text,
    error: null,
  };
}

function normalize(obj: Partial<ParsedEmail>, variantIdsByTreatment: Map<string, Set<string>>): ParsedEmail {
  const knownTreatmentIds = new Set(variantIdsByTreatment.keys());
  const treatmentCandidates = normalizeTreatmentCandidates(obj.treatment_candidates, knownTreatmentIds);
  const tm = obj.treatment_match;
  const bestCandidate = treatmentCandidates[0] ?? null;
  const treatmentMatchId = tm && typeof tm === "object" ? knownTreatmentIdOrNull(tm.id, knownTreatmentIds) : null;
  const normalizedTreatmentMatch = bestCandidate
    ? { id: bestCandidate.id, confidence: bestCandidate.confidence }
    : treatmentMatchId
      ? {
        id: treatmentMatchId,
        confidence: tm && typeof tm.confidence === "number" ? clamp01(tm.confidence) : 0,
      }
      : null;
  const vm = obj.variant_match;
  const requestedDates = normalizeDateList(obj.requested_dates, obj.requested_date);
  return {
    client_first_name: stringOrNull(obj.client_first_name),
    client_last_name: stringOrNull(obj.client_last_name),
    client_civility: normalizeCivility(obj.client_civility),
    email: stringOrNull(obj.email),
    phone: stringOrNull(obj.phone),
    requested_date: requestedDates[0] ?? stringOrNull(obj.requested_date),
    requested_dates: requestedDates,
    requested_time: stringOrNull(obj.requested_time),
    treatment_match: normalizedTreatmentMatch,
    treatment_candidates: treatmentCandidates,
    variant_match: normalizeVariantMatch(vm, normalizedTreatmentMatch?.id ?? null, variantIdsByTreatment),
    guest_count: typeof obj.guest_count === "number" && obj.guest_count > 0 ? Math.floor(obj.guest_count) : null,
    // Le titre est coupé net : un titre de tâche doit tenir sur une ligne.
    summary: stringOrNull(obj.summary)?.slice(0, 70).trim() ?? null,
    notes: stringOrNull(obj.notes),
    intent_confidence: typeof obj.intent_confidence === "number" ? clamp01(obj.intent_confidence) : 0,
    detected_language: stringOrNull(obj.detected_language),
  };
}

// A variant only means something under its own treatment. The model is told to pick
// one from the chosen treatment, but nothing guaranteed it: a variant belonging to
// another treatment would have flowed into the booking conversion as a wrong duration
// and a wrong price.
function normalizeVariantMatch(
  value: unknown,
  treatmentId: string | null,
  variantIdsByTreatment: Map<string, Set<string>>,
): { id: string | null; confidence: number } | null {
  if (!treatmentId || !value || typeof value !== "object") return null;
  const vm = value as Partial<{ id: unknown; confidence: unknown }>;
  const id = stringOrNull(vm.id);
  if (!id || !variantIdsByTreatment.get(treatmentId)?.has(id)) return null;
  return {
    id,
    confidence: typeof vm.confidence === "number" ? clamp01(vm.confidence) : 0,
  };
}

function normalizeTreatmentCandidates(value: unknown, knownTreatmentIds: Set<string>): TreatmentCandidate[] {
  if (!Array.isArray(value)) return [];
  const candidates: TreatmentCandidate[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const c = candidate as Partial<TreatmentCandidate>;
    const id = knownTreatmentIdOrNull(c.id, knownTreatmentIds);
    if (!id) continue;
    candidates.push({
      id,
      confidence: typeof c.confidence === "number" ? clamp01(c.confidence) : 0,
      reason: stringOrNull(c.reason),
    });
  }
  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 2);
}

function knownTreatmentIdOrNull(value: unknown, knownTreatmentIds: Set<string>): string | null {
  const id = stringOrNull(value);
  if (!id) return null;
  return knownTreatmentIds.has(id) ? id : null;
}

function normalizeCivility(v: unknown): "madame" | "monsieur" | null {
  const value = stringOrNull(v)?.toLowerCase();
  return value === "madame" || value === "monsieur" ? value : null;
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}


/**
 * Dates proposées, nettoyées et dédoublonnées, dans l'ordre de préférence.
 *
 * On n'accepte qu'un format ISO strict : une date approximative renvoyée par le
 * modèle vaut moins que pas de date du tout, puisqu'elle serait prise pour
 * argent comptant par la suite du traitement. `fallback` couvre le cas d'un
 * modèle qui remplit l'ancien champ seul.
 */
function normalizeDateList(value: unknown, fallback: unknown): string[] {
  const candidates = Array.isArray(value) ? value : [];
  if (candidates.length === 0 && typeof fallback === "string") candidates.push(fallback);

  const seen = new Set<string>();
  const dates: string[] = [];
  for (const entry of candidates) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) continue;
    if (Number.isNaN(new Date(`${trimmed}T00:00:00`).getTime())) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    dates.push(trimmed);
  }
  return dates;
}
