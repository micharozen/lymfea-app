// Claude Haiku 4.5 parser for inbound emails.
// Extracts structured booking intent from free-text email bodies (FR + EN),
// including emails forwarded by a hotel concierge (with embedded "---------- Forwarded message ----------" block).
//
// Returns null + error on transport/model failures so the caller can persist
// the inquiry as `failed` for manual review instead of crashing the webhook.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

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

export interface ParsedEmail {
  client_first_name: string | null;
  client_last_name: string | null;
  email: string | null;
  phone: string | null;
  requested_date: string | null; // ISO YYYY-MM-DD
  requested_time: string | null; // HH:mm
  treatment_match: { id: string | null; confidence: number } | null;
  variant_match: { id: string | null; confidence: number } | null;
  guest_count: number | null;
  notes: string | null;
  intent_confidence: number; // 0..1
  detected_language: string | null; // "fr" | "en" | ...
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
- treatment_match.id must be one of the provided treatment IDs, or null if no clear match. treatment_match.confidence in 0..1 reflects match quality.
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
  "variant_match": { "id": string|null, "confidence": number } | null,
  "guest_count": number|null,
  "notes": string|null,
  "intent_confidence": number,
  "detected_language": string|null
}`;

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

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function parseEmailWithLlm(input: ParseEmailInput): Promise<ParseEmailResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return { parsed: null, rawModelResponse: null, error: "ANTHROPIC_API_KEY not configured" };
  }

  const userMessage = buildUserMessage(input);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return {
        parsed: null,
        rawModelResponse: null,
        error: `Anthropic API ${response.status}: ${errBody.slice(0, 500)}`,
      };
    }

    const json = await response.json();
    const text = json?.content?.[0]?.text ?? "";

    const parsed = safeParseJson(text);
    if (!parsed) {
      return {
        parsed: null,
        rawModelResponse: text,
        error: "Model output was not valid JSON",
      };
    }

    return { parsed, rawModelResponse: text, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { parsed: null, rawModelResponse: null, error: `LLM call failed: ${message}` };
  }
}

function safeParseJson(text: string): ParsedEmail | null {
  if (!text) return null;

  // Tolerate accidental markdown fences from the model.
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const obj = JSON.parse(cleaned) as Partial<ParsedEmail>;
    return normalize(obj);
  } catch {
    // Try to locate the first JSON object in the response as a fallback.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1)) as Partial<ParsedEmail>;
      return normalize(obj);
    } catch {
      return null;
    }
  }
}

function normalize(obj: Partial<ParsedEmail>): ParsedEmail {
  const tm = obj.treatment_match;
  const vm = obj.variant_match;
  const confidence = typeof obj.intent_confidence === "number" ? clamp01(obj.intent_confidence) : 0;
  return {
    client_first_name: stringOrNull(obj.client_first_name),
    client_last_name: stringOrNull(obj.client_last_name),
    email: stringOrNull(obj.email),
    phone: stringOrNull(obj.phone),
    requested_date: stringOrNull(obj.requested_date),
    requested_time: stringOrNull(obj.requested_time),
    treatment_match: tm && typeof tm === "object"
      ? {
        id: stringOrNull(tm.id),
        confidence: typeof tm.confidence === "number" ? clamp01(tm.confidence) : 0,
      }
      : null,
    variant_match: vm && typeof vm === "object"
      ? {
        id: stringOrNull(vm.id),
        confidence: typeof vm.confidence === "number" ? clamp01(vm.confidence) : 0,
      }
      : null,
    guest_count: typeof obj.guest_count === "number" && obj.guest_count > 0 ? Math.floor(obj.guest_count) : null,
    notes: stringOrNull(obj.notes),
    intent_confidence: confidence,
    detected_language: stringOrNull(obj.detected_language),
  };
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
