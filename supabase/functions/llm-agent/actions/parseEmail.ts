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
  email: string | null;
  phone: string | null;
  requested_date: string | null;
  requested_time: string | null;
  treatment_match: { id: string | null; confidence: number } | null;
  treatment_candidates: TreatmentCandidate[];
  variant_match: { id: string | null; confidence: number } | null;
  guest_count: number | null;
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
- requested_date must be ISO YYYY-MM-DD if a specific date is mentioned (resolve relative dates like "demain", "next Friday" to absolute dates using today's date provided in the user message).
- requested_time must be HH:mm 24h.
- treatment_candidates must contain the 1 or 2 most relevant treatments from the provided treatment list, sorted by relevance. Each id must be one of the provided treatment IDs. Use [] if no treatment is plausible. Include a short reason based on the email wording.
- treatment_match is the best candidate from treatment_candidates for backward compatibility. If treatment_candidates is empty, treatment_match.id must be null. treatment_match.confidence in 0..1 reflects match quality.
- variant_match.id must be one of the variant IDs listed UNDER the chosen treatment, or null. Pick a variant when the email specifies a duration (e.g. "60 minutes", "1h30") and/or a guest_count (e.g. "pour 2 personnes", "duo"). Match by closest duration AND matching guest_count; prefer the variant whose duration equals the requested duration and whose guest_count matches the requested guest_count. If only one of the two is specified, use the one that's specified and ignore the other. If no variant fits, return null.
- intent_confidence in 0..1 reflects how confident you are that this email is a genuine booking request (not spam, not a follow-up question, not a thank-you note).
- detected_language: ISO 639-1 ("fr", "en", ...).

Schema:
{
  "client_first_name": string|null,
  "client_last_name": string|null,
  "email": string|null,
  "phone": string|null,
  "requested_date": string|null,
  "requested_time": string|null,
  "treatment_match": { "id": string|null, "confidence": number } | null,
  "treatment_candidates": Array<{ "id": string, "confidence": number, "reason": string|null }>,
  "variant_match": { "id": string|null, "confidence": number } | null,
  "guest_count": number|null,
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
      const head = `- id=${t.id} | name="${t.name ?? ""}" | name_en="${t.name_en ?? ""}" | duration=${t.duration ?? "?"}min | category=${t.category ?? "?"}`;
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

  return {
    parsed: normalize(raw, new Set(input.treatments.map(t => t.id))),
    rawModelResponse: text,
    error: null,
  };
}

function normalize(obj: Partial<ParsedEmail>, knownTreatmentIds: Set<string>): ParsedEmail {
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
  return {
    client_first_name: stringOrNull(obj.client_first_name),
    client_last_name: stringOrNull(obj.client_last_name),
    email: stringOrNull(obj.email),
    phone: stringOrNull(obj.phone),
    requested_date: stringOrNull(obj.requested_date),
    requested_time: stringOrNull(obj.requested_time),
    treatment_match: normalizedTreatmentMatch,
    treatment_candidates: treatmentCandidates,
    variant_match: vm && typeof vm === "object"
      ? {
        id: stringOrNull(vm.id),
        confidence: typeof vm.confidence === "number" ? clamp01(vm.confidence) : 0,
      }
      : null,
    guest_count: typeof obj.guest_count === "number" && obj.guest_count > 0 ? Math.floor(obj.guest_count) : null,
    notes: stringOrNull(obj.notes),
    intent_confidence: typeof obj.intent_confidence === "number" ? clamp01(obj.intent_confidence) : 0,
    detected_language: stringOrNull(obj.detected_language),
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

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
