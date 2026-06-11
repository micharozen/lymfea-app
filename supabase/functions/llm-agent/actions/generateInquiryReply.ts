// Generates a suggested email reply for an inbound inquiry that doesn't carry
// enough info to be auto-converted into a booking (e.g. "do you have availability
// next Thursday for a massage?"). Combines:
//   - parsed_data (name, requested_date, requested_time, treatment hints)
//   - the venue's treatment menu
//   - real-time availability for the requested date (via check-availability)
// and asks Claude Haiku to draft a professional, warm reply in the email's language.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { callAnthropic, safeParseJsonObject } from "../../_shared/anthropic-client.ts";

interface InquiryRow {
  id: string;
  hotel_id: string | null;
  from_address: string;
  to_address: string | null;
  subject: string | null;
  raw_body_text: string | null;
  raw_body_html: string | null;
  parsed_data: ParsedDataShape | null;
  direction: string;
}

interface ParsedDataShape {
  client_first_name?: string | null;
  client_last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  requested_date?: string | null;
  requested_time?: string | null;
  treatment_match?: { id: string | null; confidence: number } | null;
  treatment_candidates?: TreatmentCandidate[] | null;
  variant_match?: { id: string | null; confidence: number } | null;
  guest_count?: number | null;
  notes?: string | null;
  intent_confidence?: number;
  detected_language?: string | null;
}

interface TreatmentCandidate {
  id: string | null;
  confidence: number;
  reason?: string | null;
}

interface HotelRow {
  id: string;
  name: string | null;
  slug: string | null;
  opening_time: string | null;
  closing_time: string | null;
  timezone: string | null;
  language?: string | null;
}

interface TreatmentRow {
  id: string;
  slug: string | null;
  name: string | null;
  name_en: string | null;
  duration: number | null;
  price: number | null;
  price_on_request: boolean | null;
  treatment_type: string | null;
}

interface TreatmentAvailability {
  treatment: TreatmentRow;
  confidence: number;
  reason: string | null;
  slots: string[];
}

interface PublicTreatmentLink {
  treatment: TreatmentRow;
  confidence: number;
  reason: string | null;
  url: string;
}

export interface GenerateInquiryReplyResult {
  subject: string;
  body: string;
  language: string;
  availabilityChecked: boolean;
  availableSlotsPreview: string[];
}


const SYSTEM_PROMPT = `You draft email replies on behalf of a spa/hotel venue (Eïa platform).
You receive: the original client email, what we extracted from it (name/date/treatment candidates/etc.), the venue's treatment menu, and (if a date was requested) the live availability for that date.

Goal: produce a warm, professional, concise reply that helps the client move forward — either by confirming what's possible, suggesting concrete options, or asking for the minimum missing info.

Rules:
- Reply in the client's language (use detected_language if set, otherwise infer from the email body). Never mix languages.
- Be specific: when a date is given and availability is known, mention concise time options (don't dump the whole grid).
- Format proposed time options as a short bullet list grouped by period (for example: "- Matin : ..." and "- Après-midi : ...").
- If many available slots are consecutive, prefer a range such as "créneaux de 8h à 12h" instead of listing every slot.
- If slots are isolated rather than consecutive, include up to 3 morning options and up to 3 afternoon options when available.
- If availability is checked per likely treatment, only mention slots for those specific treatments. Do not imply generic availability applies to every treatment.
- When the requested treatment matches one in the menu, name it explicitly with its duration.
- When the treatment is ambiguous, suggest the checked treatment candidates from the menu and their availability if provided. Do not ask the client to specify a treatment without naming the best candidate options we found.
- Always include the public treatment menu link when provided, even if we found a good treatment candidate. Candidate treatment links are optional if they keep the reply concise.
- When there is no reliable treatment match, ask the client to confirm the treatment before proposing generic slots and include the public treatment menu link if available.
- When date is missing, ask for it politely along with a treatment preference.
- Sign with the venue name (no fake first names).
- Output a single JSON object: { "subject": string, "body": string, "language": string }. No markdown, no code fences.
- "body" is plain text with \\n for line breaks. Paragraphs separated by a single blank line. No HTML.
- Keep it under 12 lines of body. Brevity wins.`;

export async function generateInquiryReply(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<{ result: GenerateInquiryReplyResult | null; error: string | null }> {
  // 1. Load inquiry (root only)
  const { data: inquiryData, error: inquiryErr } = await supabase
    .from("email_inquiries")
    .select("id, hotel_id, from_address, to_address, subject, raw_body_text, raw_body_html, parsed_data, direction")
    .eq("id", inquiryId)
    .maybeSingle();

  if (inquiryErr) return { result: null, error: `Inquiry lookup failed: ${inquiryErr.message}` };
  const inquiry = inquiryData as InquiryRow | null;
  if (!inquiry) return { result: null, error: "Inquiry not found" };
  if (inquiry.direction !== "inbound") {
    return { result: null, error: "Cannot generate a reply for an outbound row" };
  }

  // 2. Load hotel (if known)
  let hotel: HotelRow | null = null;
  if (inquiry.hotel_id) {
    const { data: hotelData, error: hotelError } = await supabase
      .from("hotels")
      .select("id, name, slug, opening_time, closing_time, timezone")
      .eq("id", inquiry.hotel_id)
      .maybeSingle();
    if (hotelError) {
      console.warn("[generateInquiryReply] hotel lookup failed", {
        inquiryId,
        hotelId: inquiry.hotel_id,
        error: hotelError.message,
      });
    }
    hotel = (hotelData as HotelRow | null) ?? null;
    console.log("[generateInquiryReply] hotel lookup result", {
      inquiryId,
      hotelId: inquiry.hotel_id,
      found: Boolean(hotel),
      hotelRowId: hotel?.id ?? null,
      hotelName: hotel?.name ?? null,
      hotelSlug: hotel?.slug ?? null,
      selectedColumns: ["id", "name", "slug", "opening_time", "closing_time", "timezone"],
    });
  }

  // 3. Load treatment menu for this venue
  let treatments: TreatmentRow[] = [];
  if (inquiry.hotel_id) {
    const { data: treatmentData } = await supabase
      .from("treatment_menus")
      .select("id, slug, name, name_en, duration, price, price_on_request, treatment_type")
      .eq("hotel_id", inquiry.hotel_id)
      .eq("status", "active");
    treatments = (treatmentData as TreatmentRow[] | null) ?? [];
  }

  // 4. Check availability if a date was requested
  const requestedDate = inquiry.parsed_data?.requested_date ?? null;
  let availableSlots: string[] = [];
  let treatmentAvailabilities: TreatmentAvailability[] = [];
  let availabilityChecked = false;
  let availabilityCheckFailed = false;
  if (requestedDate && inquiry.hotel_id) {
    const hotelId = inquiry.hotel_id;
    availabilityChecked = true;
    const treatmentCandidates = getAvailabilityTreatmentCandidates(inquiry.parsed_data, treatments);
    try {
      if (treatmentCandidates.length > 0) {
        const settled = await Promise.allSettled(
          treatmentCandidates.map(async candidate => {
            const slots = await checkAvailabilitySlots(supabase, {
              hotelId,
              date: requestedDate,
              treatmentIds: [candidate.treatment.id],
              requiredGuestCount: inquiry.parsed_data?.guest_count ?? 1,
            });
            return {
              treatment: candidate.treatment,
              confidence: candidate.confidence,
              reason: candidate.reason,
              slots,
            };
          }),
        );
        treatmentAvailabilities = settled
          .filter((r): r is PromiseFulfilledResult<TreatmentAvailability> => r.status === "fulfilled")
          .map(r => r.value);
        const failedCount = settled.filter(r => r.status === "rejected").length;
        if (failedCount > 0) {
          console.warn(`[generateInquiryReply] ${failedCount}/${settled.length} availability check(s) failed for inquiry ${inquiryId}`);
        }
        availableSlots = [...new Set(treatmentAvailabilities.flatMap(item => item.slots))];
        if (treatmentAvailabilities.length === 0) {
          availabilityChecked = false;
          availabilityCheckFailed = true;
        }
      } else {
        availableSlots = await checkAvailabilitySlots(supabase, {
          hotelId,
          date: requestedDate,
          treatmentIds: [],
          requiredGuestCount: inquiry.parsed_data?.guest_count ?? 1,
        });
      }
    } catch (e) {
      // Soft failure: avoid presenting an infrastructure error as "fully booked".
      console.error("[generateInquiryReply] availability check failed:", e);
      availabilityChecked = false;
      availabilityCheckFailed = true;
      availableSlots = [];
      treatmentAvailabilities = [];
    }
  }

  // 5. Build prompt and call LLM
  const linkLanguage = publicLinkLanguage(inquiry.parsed_data?.detected_language ?? hotel?.language ?? null);
  const publicIdentifier = publicVenueIdentifier(hotel, inquiry);
  const publicCatalogUrl = buildPublicCatalogUrl(publicIdentifier, hotel, inquiry, linkLanguage);
  const publicTreatmentLinks = buildPublicTreatmentLinks(publicIdentifier, inquiry.parsed_data, treatments, linkLanguage);
  console.log("[generateInquiryReply] public links context", {
    inquiryId,
    hotelId: inquiry.hotel_id,
    hotelSlug: hotel?.slug ?? null,
    inquiryToAddress: inquiry.to_address,
    publicIdentifier,
    linkLanguage,
    siteUrl: publicBaseUrl(),
    publicCatalogUrl,
    publicTreatmentLinkCount: publicTreatmentLinks.length,
    publicTreatmentLinks: publicTreatmentLinks.map(item => ({
      treatmentId: item.treatment.id,
      treatmentSlug: item.treatment.slug,
      confidence: item.confidence,
      url: item.url,
    })),
  });
  const userMessage = buildUserMessage({
    inquiry,
    hotel,
    treatments,
    requestedDate,
    availabilityChecked,
    availabilityCheckFailed,
    availableSlots,
    treatmentAvailabilities,
    publicCatalogUrl,
    publicTreatmentLinks,
  });

  const { text, error } = await callAnthropic({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    maxTokens: 800,
  });

  if (error) return { result: null, error };

  const parsed = safeParseJsonObject<{ subject?: unknown; body?: unknown; language?: unknown }>(text);
  if (!parsed) {
    return { result: null, error: `Model output was not valid JSON: ${text?.slice(0, 200)}` };
  }

  const subject = typeof parsed.subject === "string" && parsed.subject.trim().length > 0
    ? parsed.subject.trim()
    : reSubject(inquiry.subject);
  const rawBody = typeof parsed.body === "string" && parsed.body.trim().length > 0
    ? parsed.body.trim()
    : "";
  const language = typeof parsed.language === "string" && parsed.language.length > 0
    ? parsed.language
    : (inquiry.parsed_data?.detected_language ?? hotel?.language ?? "fr");
  const body = ensureCatalogLink(rawBody, publicCatalogUrl, language);
  console.log("[generateInquiryReply] catalog link post-process", {
    inquiryId,
    language,
    publicCatalogUrl,
    hadCatalogLinkBefore: Boolean(publicCatalogUrl && rawBody.includes(publicCatalogUrl)),
    hasCatalogLinkAfter: Boolean(publicCatalogUrl && body.includes(publicCatalogUrl)),
    rawBodyLength: rawBody.length,
    finalBodyLength: body.length,
  });

  if (!body) {
    return { result: null, error: "Model returned an empty body" };
  }

  return {
    result: {
      subject,
      body,
      language,
      availabilityChecked,
      availableSlotsPreview: availableSlots.slice(0, 8),
    },
    error: null,
  };
}

async function checkAvailabilitySlots(
  supabase: SupabaseClient,
  body: {
    hotelId: string;
    date: string;
    treatmentIds: string[];
    requiredGuestCount: number;
  },
): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke("check-availability", {
    body,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "Availability check returned no data");
  }
  return normalizeAvailabilitySlots(data);
}

function reSubject(subject: string | null): string {
  if (!subject) return "Re: votre demande";
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

function normalizeAvailabilitySlots(availData: unknown): string[] {
  const slots = Array.isArray((availData as { availableSlots?: unknown[] } | null)?.availableSlots)
    ? (availData as { availableSlots: unknown[] }).availableSlots
    : [];
  return slots.filter((slot): slot is string => typeof slot === "string");
}

// https://app.eiaspa.fr/client/hotel-monsieur-george?lang=fr 
function publicBaseUrl(): string {
  return (Deno.env.get("SITE_URL") || "https://app.eiaspa.fr").replace(/\/+$/, "");
}

function publicVenueIdentifier(hotel: HotelRow | null, inquiry: InquiryRow): string | null {
  return hotel?.slug ?? inboundAlias(inquiry.to_address) ?? inquiry.hotel_id;
}

function inboundAlias(toAddress: string | null): string | null {
  const [alias] = (toAddress ?? "").split("@");
  return alias && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alias) ? alias : null;
}

function publicLinkLanguage(language: string | null): "fr" | "en" {
  return language?.toLowerCase().startsWith("en") ? "en" : "fr";
}

function withLanguageParam(url: string, language: "fr" | "en"): string {
  return `${url}?lang=${language}`;
}

function buildPublicCatalogUrl(
  identifier: string | null,
  hotel: HotelRow | null,
  inquiry: InquiryRow,
  language: "fr" | "en",
): string | null {
  if (!identifier) {
    console.warn("[generateInquiryReply] cannot build public catalog URL: missing venue identifier", {
      hotelId: hotel?.id ?? null,
      hotelName: hotel?.name ?? null,
      inquiryHotelId: inquiry.hotel_id,
      inquiryToAddress: inquiry.to_address,
    });
    return null;
  }
  const url = withLanguageParam(`${publicBaseUrl()}/client/${identifier}/treatments`, language);
  console.log("[generateInquiryReply] built public catalog URL", {
    hotelId: hotel?.id ?? inquiry.hotel_id,
    hotelSlug: hotel?.slug ?? null,
    inquiryToAddress: inquiry.to_address,
    identifier,
    language,
    url,
  });
  return url;
}

function ensureCatalogLink(body: string, catalogUrl: string | null, language: string): string {
  if (!body) {
    console.warn("[generateInquiryReply] catalog link not injected: empty body");
    return body;
  }
  if (!catalogUrl) {
    console.warn("[generateInquiryReply] catalog link not injected: missing catalog URL");
    return body;
  }
  if (body.includes(catalogUrl)) {
    console.log("[generateInquiryReply] catalog link already present in model output", { catalogUrl });
    return body;
  }

  const linkLine = language.toLowerCase().startsWith("fr")
    ? `Vous pouvez aussi consulter le menu complet des soins ici : ${catalogUrl}`
    : `You can also browse the full treatment menu here: ${catalogUrl}`;

  const signoffPattern = /\n\n(Cordialement|Bien cordialement|Bien à vous|À bientôt|A bientôt|Au plaisir|Best regards|Kind regards|Regards|Sincerely),?/i;
  const match = body.match(signoffPattern);
  if (match?.index === undefined) {
    console.log("[generateInquiryReply] catalog link appended at end: no known signoff found", { catalogUrl });
    return `${body}\n\n${linkLine}`;
  }

  console.log("[generateInquiryReply] catalog link inserted before signoff", {
    catalogUrl,
    signoff: match[1],
  });
  return `${body.slice(0, match.index)}\n\n${linkLine}${body.slice(match.index)}`;
}

function buildPublicTreatmentLinks(
  venueIdentifier: string | null,
  parsed: ParsedDataShape | null,
  treatments: TreatmentRow[],
  language: "fr" | "en",
): PublicTreatmentLink[] {
  if (!venueIdentifier) return [];
  return getAvailabilityTreatmentCandidates(parsed, treatments)
    .map(candidate => ({
      ...candidate,
      url: withLanguageParam(
        `${publicBaseUrl()}/client/${venueIdentifier}/treatment/${candidate.treatment.slug ?? candidate.treatment.id}`,
        language,
      ),
    }));
}

function getAvailabilityTreatmentCandidates(
  parsed: ParsedDataShape | null,
  treatments: TreatmentRow[],
): Array<{ treatment: TreatmentRow; confidence: number; reason: string | null }> {
  const byId = new Map(treatments.map(t => [t.id, t]));
  const rawCandidates = Array.isArray(parsed?.treatment_candidates)
    ? parsed.treatment_candidates
    : [];
  const candidates = rawCandidates
    .filter((candidate): candidate is TreatmentCandidate & { id: string } => typeof candidate?.id === "string")
    .map(candidate => ({
      id: candidate.id,
      confidence: clamp01(candidate.confidence),
      reason: typeof candidate.reason === "string" ? candidate.reason.trim() || null : null,
    }));

  if (candidates.length === 0 && parsed?.treatment_match?.id) {
    candidates.push({
      id: parsed.treatment_match.id,
      confidence: clamp01(parsed.treatment_match.confidence),
      reason: null,
    });
  }

  const seen = new Set<string>();
  return candidates
    .filter(candidate => candidate.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .filter(candidate => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return byId.has(candidate.id);
    })
    .slice(0, 2)
    .map(candidate => {
      const treatment = byId.get(candidate.id);
      if (!treatment) return null;
      return {
        treatment,
        confidence: candidate.confidence,
        reason: candidate.reason,
      };
    })
    .filter((candidate): candidate is { treatment: TreatmentRow; confidence: number; reason: string | null } => candidate !== null);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
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

function buildUserMessage(args: {
  inquiry: InquiryRow;
  hotel: HotelRow | null;
  treatments: TreatmentRow[];
  requestedDate: string | null;
  availabilityChecked: boolean;
  availabilityCheckFailed: boolean;
  availableSlots: string[];
  treatmentAvailabilities: TreatmentAvailability[];
  publicCatalogUrl: string | null;
  publicTreatmentLinks: PublicTreatmentLink[];
}): string {
  const { inquiry, hotel, treatments, requestedDate, availabilityChecked, availabilityCheckFailed, availableSlots, treatmentAvailabilities, publicCatalogUrl, publicTreatmentLinks } = args;
  const p = inquiry.parsed_data ?? {};

  const treatmentList = treatments
    .slice(0, 30)
    .map(t => {
      const price = t.price_on_request ? "price on request"
        : (t.price != null ? `${t.price}€` : "?");
      const duration = t.duration != null ? `${t.duration}min` : "?";
      return `- id=${t.id} | name="${t.name ?? t.name_en ?? ""}" | duration=${duration} | price=${price}`;
    })
    .join("\n") || "(no treatments configured)";

  const availabilityBlock = buildAvailabilityBlock({
    requestedDate,
    availabilityChecked,
    availabilityCheckFailed,
    availableSlots,
    treatmentAvailabilities,
  });
  const publicLinksBlock = buildPublicLinksBlock(publicCatalogUrl, publicTreatmentLinks);

  const body = inquiry.raw_body_text?.trim()
    || stripHtml(inquiry.raw_body_html ?? "")
    || "(empty body)";

  const parsedHints: string[] = [];
  if (p.client_first_name || p.client_last_name) {
    parsedHints.push(`Client: ${[p.client_first_name, p.client_last_name].filter(Boolean).join(" ")}`);
  }
  if (p.requested_date) parsedHints.push(`Requested date: ${p.requested_date}`);
  if (p.requested_time) parsedHints.push(`Requested time: ${p.requested_time}`);
  if (p.guest_count) parsedHints.push(`Guest count: ${p.guest_count}`);
  if (p.treatment_match?.id) {
    const t = treatments.find(x => x.id === p.treatment_match?.id);
    parsedHints.push(`Likely treatment: ${t?.name ?? t?.name_en ?? p.treatment_match.id}`);
  }
  if (Array.isArray(p.treatment_candidates) && p.treatment_candidates.length > 0) {
    const candidateText = p.treatment_candidates
      .slice(0, 2)
      .map(candidate => {
        const t = treatments.find(x => x.id === candidate.id);
        const name = t?.name ?? t?.name_en ?? candidate.id ?? "unknown";
        return `${name} (${Math.round(clamp01(candidate.confidence) * 100)}%)`;
      })
      .join(", ");
    parsedHints.push(`Treatment candidates: ${candidateText}`);
  }
  if (p.detected_language) parsedHints.push(`Detected language: ${p.detected_language}`);
  if (p.notes) parsedHints.push(`Notes: ${p.notes}`);

  return [
    `Venue: ${hotel?.name ?? "(unknown)"}`,
    `Venue opening hours: ${hotel?.opening_time ?? "?"} – ${hotel?.closing_time ?? "?"}`,
    `Original sender: ${inquiry.from_address}`,
    `Original subject: ${inquiry.subject ?? "(no subject)"}`,
    ``,
    `What we extracted from the email:`,
    parsedHints.length > 0 ? parsedHints.map(h => `  ${h}`).join("\n") : "  (nothing actionable)",
    ``,
    `Treatment menu:`,
    treatmentList,
    ``,
    availabilityBlock,
    ``,
    publicLinksBlock,
    ``,
    `Original email body:`,
    body,
    ``,
    `Now draft the reply as a single JSON object { "subject", "body", "language" }.`,
  ].join("\n");
}

function buildAvailabilityBlock(args: {
  requestedDate: string | null;
  availabilityChecked: boolean;
  availabilityCheckFailed: boolean;
  availableSlots: string[];
  treatmentAvailabilities: TreatmentAvailability[];
}): string {
  const { requestedDate, availabilityChecked, availabilityCheckFailed, availableSlots, treatmentAvailabilities } = args;
  if (!availabilityChecked) {
    if (availabilityCheckFailed && requestedDate) {
      return "Availability: check failed (infrastructure error); do not mention availability or ask for a date — the client already provided one.";
    }
    return "Availability: not checked (no specific date requested).";
  }

  if (treatmentAvailabilities.length > 0) {
    const lines = treatmentAvailabilities.map(item => {
      const name = item.treatment.name ?? item.treatment.name_en ?? item.treatment.id;
      const duration = item.treatment.duration != null ? `${item.treatment.duration}min` : "duration unknown";
      const confidence = `${Math.round(item.confidence * 100)}% match`;
      const slots = item.slots.length > 0
        ? formatRepresentativeSlots(item.slots)
        : "NO open slots for this treatment";
      const reason = item.reason ? ` | reason="${item.reason}"` : "";
      return `- ${name} (${duration}, ${confidence}${reason}): ${slots}`;
    });
    return [
      `Availability on ${requestedDate}, checked per likely treatment:`,
      ...lines,
    ].join("\n");
  }

  return availableSlots.length > 0
    ? `Availability on ${requestedDate} (generic, no reliable treatment match; representative open slots): ${formatRepresentativeSlots(availableSlots)}`
    : `Availability on ${requestedDate}: NO open slots that day (closed or fully booked).`;
}

function formatRepresentativeSlots(slots: string[]): string {
  const uniqueSlots = [...new Set(slots)].sort();
  const morning = uniqueSlots.filter(slot => timeToMinutes(slot) < 12 * 60);
  const afternoon = uniqueSlots.filter(slot => timeToMinutes(slot) >= 12 * 60);

  const parts: string[] = [];
  if (morning.length > 0) parts.push(`morning: ${formatPeriodAvailability(morning)}`);
  if (afternoon.length > 0) parts.push(`afternoon: ${formatPeriodAvailability(afternoon)}`);
  return parts.length > 0 ? parts.join(" | ") : formatPeriodAvailability(uniqueSlots);
}

function formatPeriodAvailability(slots: string[]): string {
  const ranges = buildConsecutiveRanges(slots);
  const interval = inferSlotInterval(slots);
  const consecutiveRanges = ranges.filter(range => range.length >= 3);
  if (consecutiveRanges.length > 0) {
    const rangeText = consecutiveRanges
      .map(range => `continuous slots from ${formatSlotTime(range[0])} to ${formatSlotTime(addSlotInterval(range[range.length - 1], interval))}`);
    const isolatedSlots = ranges
      .filter(range => range.length < 3)
      .flat();
    if (isolatedSlots.length > 0) {
      rangeText.push(`also ${selectRepresentativeSlots(isolatedSlots, 3).map(formatSlotTime).join(", ")}`);
    }
    return rangeText.join("; ");
  }
  return selectRepresentativeSlots(slots, 3).map(formatSlotTime).join(", ");
}

function selectRepresentativeSlots(slots: string[], maxSlots: number): string[] {
  const uniqueSlots = [...new Set(slots)].sort();
  if (uniqueSlots.length <= maxSlots) return uniqueSlots;

  const selected: string[] = [];

  const addEvenly = (bucket: string[], count: number) => {
    if (bucket.length === 0 || count <= 0) return;
    if (bucket.length <= count) {
      selected.push(...bucket);
      return;
    }
    const step = (bucket.length - 1) / Math.max(1, count - 1);
    for (let i = 0; i < count; i += 1) {
      selected.push(bucket[Math.round(i * step)]);
    }
  };

  addEvenly(uniqueSlots, maxSlots);

  return [...new Set(selected)].sort().slice(0, maxSlots);
}

function buildConsecutiveRanges(slots: string[]): string[][] {
  const uniqueSlots = [...new Set(slots)].sort();
  if (uniqueSlots.length === 0) return [];
  const interval = inferSlotInterval(uniqueSlots);
  const ranges: string[][] = [];
  let currentRange: string[] = [uniqueSlots[0]];

  for (const slot of uniqueSlots.slice(1)) {
    const previous = currentRange[currentRange.length - 1];
    if (timeToMinutes(slot) - timeToMinutes(previous) === interval) {
      currentRange.push(slot);
    } else {
      ranges.push(currentRange);
      currentRange = [slot];
    }
  }
  ranges.push(currentRange);
  return ranges;
}

function inferSlotInterval(slots: string[]): number {
  const deltas = slots
    .map(timeToMinutes)
    .sort((a, b) => a - b)
    .map((minutes, index, sorted) => index === 0 ? 0 : minutes - sorted[index - 1])
    .filter(delta => delta > 0);
  if (deltas.length === 0) return 30;
  const counts = new Map<number, number>();
  for (const delta of deltas) {
    counts.set(delta, (counts.get(delta) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function addSlotInterval(slot: string, intervalMinutes: number): string {
  const total = timeToMinutes(slot) + intervalMinutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`;
}

function formatSlotTime(slot: string): string {
  const minutes = timeToMinutes(slot);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`;
}

function timeToMinutes(slot: string): number {
  const [h = "0", m = "0"] = slot.split(":");
  return Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10);
}

function buildPublicLinksBlock(catalogUrl: string | null, treatmentLinks: PublicTreatmentLink[]): string {
  const lines: string[] = [];
  if (catalogUrl) {
    lines.push(`Public treatment menu link: ${catalogUrl}`);
  }
  if (treatmentLinks.length > 0) {
    lines.push("Public links for likely treatment candidates:");
    for (const item of treatmentLinks) {
      const name = item.treatment.name ?? item.treatment.name_en ?? item.treatment.id;
      lines.push(`- ${name} (${Math.round(item.confidence * 100)}% match): ${item.url}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "Public treatment links: unavailable.";
}
