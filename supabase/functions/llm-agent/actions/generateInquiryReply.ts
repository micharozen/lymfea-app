// Generates a suggested email reply for an inbound inquiry that doesn't carry
// enough info to be auto-converted into a booking (e.g. "do you have availability
// next Thursday for a massage?"). Combines:
//   - parsed_data (name, civility, requested_date, requested_time, treatment hints)
//   - the customer record when we already know them (civility, name, language)
//   - the venue's treatment menu, add-ons kept apart (never bookable alone)
//   - the venue's tone of voice + knowledge base (venue_inbox_settings)
//   - the previous messages of the thread
//   - real-time availability for the requested date (via get-availability)
// and asks Claude Haiku to draft a professional, warm reply in the email's language.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { callAnthropic, safeParseJsonObject } from "../../_shared/anthropic-client.ts";
import { fetchPublicTreatments, type PublicTreatment } from "../../_shared/publicTreatments.ts";

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
  client_civility?: string | null;
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
  description: string | null;
  description_en: string | null;
  cancellation_policy_text_fr: string | null;
  cancellation_policy_text_en: string | null;
  website_url: string | null;
  address: string | null;
  city: string | null;
}

interface InboxSettingsRow {
  reply_greeting_fr: string | null;
  reply_greeting_en: string | null;
  reply_signoff_fr: string | null;
  reply_signoff_en: string | null;
  reply_signature: string | null;
  reply_tone_notes: string | null;
  knowledge_base_fr: string | null;
  knowledge_base_en: string | null;
}

interface CustomerRow {
  first_name: string | null;
  last_name: string | null;
  civility: string | null;
  language: string | null;
}

interface ThreadMessage {
  direction: string;
  created_at: string;
  subject: string | null;
  raw_body_text: string | null;
  raw_body_html: string | null;
}

/** Who we address in the reply, resolved from the customer record then the parser. */
interface ClientIdentity {
  firstName: string | null;
  lastName: string | null;
  civility: "madame" | "monsieur" | null;
  language: string | null;
  source: "customer" | "parsed" | "none";
}

type TreatmentRow = PublicTreatment;

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


const BASE_SYSTEM_PROMPT = `You draft email replies on behalf of a spa/hotel venue (Eïa platform).
You receive: the original client email, what we extracted from it (name/date/treatment candidates/etc.), who the client is, the venue's treatment menu, the venue's knowledge base, the previous messages of the thread, and (if a date was requested) the live availability for that date.

Goal: produce a warm, professional, concise reply that helps the client move forward — either by confirming what's possible, suggesting concrete options, answering the question that was asked, or requesting the minimum missing info.

Register: you write for a five-star hospitality clientele. Courteous, polished, never casual — no exclamation marks beyond the sign-off, no filler enthusiasm. Use "vous" at all times in French.

Rules:
- Reply in the client's language (use detected_language if set, otherwise infer from the email body). Never mix languages.
- The salutation is always the first line of the body, standing on its own line, followed by a blank line. Never fold it into a sentence.
- Salutation — pick the exact form from the "Client identity" block, there is no other option:
  · civility AND last name known → "Chère Madame Warner," / "Cher Monsieur Martin," (EN: "Dear Mrs Warner," / "Dear Mr Martin,").
  · last name known, civility unknown → "Bonjour Charlotte Warner," (EN: "Hello Charlotte Warner,") — full name, no gendered word.
  · only the first name known → "Bonjour Joris," (EN: "Hello Joris,").
  · nothing known → "Chère Madame, Cher Monsieur," (EN: "Dear Guest,").
  A gendered word ("Cher", "Chère", "Mr", "Mrs", "Ms") is allowed ONLY in the first case, where the civility is explicitly given. "Chère Nathalie" or "Chère Madame Askayo" without a stated civility is a gender guess and is forbidden — "Bonjour" is the correct fallback and is not casual here. Never reuse the civility of the person who forwarded the email.
  Whenever a name is known it must appear in the salutation — never fall back to an anonymous "Dear Guest," alone.
- Never state a price, a package, an opening hour, a facility or a service that is not in the treatment menu or in the venue knowledge base. If the client asks about something outside them (beach club, restaurant, gift box, room, hotel logistics), acknowledge the request and say that a member of the team will come back to them on that point. Never improvise, never estimate.
- Add-ons are complements: they can never be booked on their own. Never propose one as a standalone appointment. Mention an add-on only as an optional supplement to a base treatment.
- When the email is a question rather than a booking request (low booking intent), simply answer the question. Do not push slots or a treatment that was not asked for.
- Be specific: when a date is given and availability is known, mention concise time options (don't dump the whole grid).
- Format proposed time options as a short bullet list grouped by period (for example: "- Matin : ..." and "- Après-midi : ...").
- If many available slots are consecutive, prefer a range such as "créneaux de 8h à 12h" instead of listing every slot.
- If slots are isolated rather than consecutive, include up to 3 morning options and up to 3 afternoon options when available.
- If availability is checked per likely treatment, only mention slots for those specific treatments. Do not imply generic availability applies to every treatment.
- When the requested treatment matches one in the menu, name it explicitly with its duration and price. When the client asked for a specific duration, quote the price and duration of the VARIANT that matches it (the indented "·" lines), not the treatment's default line.
- When the treatment is ambiguous, suggest the checked treatment candidates from the menu and their availability if provided. Do not ask the client to specify a treatment without naming the best candidate options we found.
- When several candidates are listed with a similar match score, the client has not chosen yet — present them side by side and let them pick. Never single one out as if it had been requested.
- Always include the public treatment menu link when provided, even if we found a good treatment candidate. Candidate treatment links are optional if they keep the reply concise.
- When there is no reliable treatment match, ask the client to confirm the treatment before proposing generic slots and include the public treatment menu link if available.
- When date is missing, ask for it politely along with a treatment preference.
- When previous messages of the thread are provided, continue the conversation: do not repeat what was already said and do not re-introduce the venue.
- Close with a warm sentence naming the venue before the sign-off, e.g. "Au plaisir de vous accueillir au <venue name>," (EN: "We look forward to welcoming you to <venue name>,"), then sign with the venue name (no fake first names).
- Output a single JSON object: { "subject": string, "body": string, "language": string }. No markdown, no code fences.
- "body" is plain text with \\n for line breaks. Paragraphs separated by a single blank line. No HTML.
- Keep it under 14 lines of body (salutation and sign-off included). Brevity wins.`;

// The venue's house wording wins over the built-in defaults: greeting, sign-off and
// signature are reproduced verbatim so replies read like the venue, not like a bot.
function buildSystemPrompt(settings: InboxSettingsRow | null): string {
  const lines: string[] = [BASE_SYSTEM_PROMPT];
  const houseRules: string[] = [];

  const greeting = pairOrNull(settings?.reply_greeting_fr, settings?.reply_greeting_en);
  if (greeting) {
    houseRules.push(`- Opening line imposed by the venue — reproduce it VERBATIM as the very first line of the body, on its own line, in the language you reply in. The name salutation then follows on its own line, and only then the first sentence:\n${greeting}`);
  }

  const signoff = pairOrNull(settings?.reply_signoff_fr, settings?.reply_signoff_en);
  if (signoff) {
    houseRules.push(`- Sign-off imposed by the venue — reproduce it VERBATIM, never substitute another one:\n${signoff}`);
  }

  if (settings?.reply_signature?.trim()) {
    houseRules.push(`- Signature block to place after the sign-off, VERBATIM, on its own lines:\n${settings.reply_signature.trim()}`);
  }

  if (settings?.reply_tone_notes?.trim()) {
    houseRules.push(`- Additional writing instructions from the venue:\n${settings.reply_tone_notes.trim()}`);
  }

  if (houseRules.length > 0) {
    lines.push("", "Venue house style (overrides the generic rules above):", houseRules.join("\n"));
  }

  return lines.join("\n");
}

function pairOrNull(fr: string | null | undefined, en: string | null | undefined): string | null {
  const parts: string[] = [];
  if (fr?.trim()) parts.push(`  FR: ${fr.trim()}`);
  if (en?.trim()) parts.push(`  EN: ${en.trim()}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

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
      .select(
        "id, name, slug, opening_time, closing_time, timezone, description, description_en, cancellation_policy_text_fr, cancellation_policy_text_en, website_url, address, city",
      )
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
    });
  }

  // 3. Load treatment menu, venue tone/knowledge settings and thread history
  let treatments: TreatmentRow[] = [];
  let settings: InboxSettingsRow | null = null;
  if (inquiry.hotel_id) {
    const hotelId = inquiry.hotel_id;
    const [menu, settingsResult] = await Promise.all([
      fetchPublicTreatments(supabase, hotelId),
      supabase
        .from("venue_inbox_settings")
        .select(
          "reply_greeting_fr, reply_greeting_en, reply_signoff_fr, reply_signoff_en, reply_signature, reply_tone_notes, knowledge_base_fr, knowledge_base_en",
        )
        .eq("hotel_id", hotelId)
        .maybeSingle(),
    ]);
    treatments = menu;
    settings = (settingsResult.data as InboxSettingsRow | null) ?? null;
  }

  const customer = await loadCustomer(supabase, inquiry);
  const identity = resolveClientIdentity(inquiry.parsed_data, customer);
  const previousMessages = await loadThreadHistory(supabase, inquiry.id);

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
  const linkLanguage = publicLinkLanguage(inquiry.parsed_data?.detected_language ?? identity.language ?? null);
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
    settings,
    identity,
    previousMessages,
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
    systemPrompt: buildSystemPrompt(settings),
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
    : (inquiry.parsed_data?.detected_language ?? identity.language ?? "fr");
  const body = ensureCatalogLink(rawBody, publicCatalogUrl, language, settings);
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

// The client we reply to is rarely the SMTP sender: 24 of the first 27 production
// inquiries were forwarded by the venue's own concierge mailbox. The address the
// parser found in the body is therefore the one to look up.
async function loadCustomer(supabase: SupabaseClient, inquiry: InquiryRow): Promise<CustomerRow | null> {
  const email = (inquiry.parsed_data?.email ?? inquiry.from_address ?? "").trim().toLowerCase();
  if (!email) return null;

  const { data, error } = await supabase
    .from("customers")
    .select("first_name, last_name, civility, language")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[generateInquiryReply] customer lookup failed", { error: error.message });
    return null;
  }
  return (data as CustomerRow | null) ?? null;
}

function resolveClientIdentity(
  parsed: ParsedDataShape | null,
  customer: CustomerRow | null,
): ClientIdentity {
  const customerCivility = normalizeCivility(customer?.civility);
  const parsedCivility = normalizeCivility(parsed?.client_civility);
  const firstName = customer?.first_name?.trim() || parsed?.client_first_name?.trim() || null;
  const lastName = customer?.last_name?.trim() || parsed?.client_last_name?.trim() || null;

  return {
    firstName,
    lastName,
    // The customer record is curated by the venue, so it wins over the extraction.
    civility: customerCivility ?? parsedCivility,
    language: customer?.language?.trim() || null,
    source: customer ? "customer" : (firstName || lastName ? "parsed" : "none"),
  };
}

function normalizeCivility(value: string | null | undefined): "madame" | "monsieur" | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (["madame", "mme", "mrs", "ms", "miss", "mademoiselle"].includes(v)) return "madame";
  if (["monsieur", "m", "m.", "mr", "mister"].includes(v)) return "monsieur";
  return null;
}

async function loadThreadHistory(supabase: SupabaseClient, rootId: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from("email_inquiries")
    .select("direction, created_at, subject, raw_body_text, raw_body_html")
    .eq("parent_inquiry_id", rootId)
    .order("created_at", { ascending: true })
    .limit(6);

  if (error) {
    console.warn("[generateInquiryReply] thread history lookup failed", { error: error.message });
    return [];
  }
  return (data as ThreadMessage[] | null) ?? [];
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
  const { data, error } = await supabase.functions.invoke("get-availability", {
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

function ensureCatalogLink(
  body: string,
  catalogUrl: string | null,
  language: string,
  settings: InboxSettingsRow | null,
): string {
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

  const match = body.match(buildSignoffPattern(settings));
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

// The catalog link must land before the sign-off, never after the signature. The
// venue's configured sign-off is matched first — a house formula such as
// "Chaleureusement," is not part of the generic list.
const DEFAULT_SIGNOFFS = [
  "Cordialement",
  "Bien cordialement",
  "Bien à vous",
  "Chaleureusement",
  "Avec nos salutations",
  "À bientôt",
  "A bientôt",
  // The closing sentence the base prompt asks for when the venue configured nothing.
  "Au plaisir",
  "We look forward to welcoming you",
  "We would be delighted to welcome you",
  "Best regards",
  "Kind regards",
  "Warm regards",
  "Warmly",
  "Regards",
  "Sincerely",
];

function buildSignoffPattern(settings: InboxSettingsRow | null): RegExp {
  const configured = [settings?.reply_signoff_fr, settings?.reply_signoff_en]
    .map(s => s?.trim().replace(/,\s*$/, ""))
    .filter((s): s is string => Boolean(s));
  const alternatives = [...configured, ...DEFAULT_SIGNOFFS]
    .map(escapeRegExp)
    .join("|");
  return new RegExp(`\\n\\n(${alternatives}),?`, "i");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  // Add-ons are excluded here on purpose: no availability check and no public link,
  // so the reply can never present one as a bookable appointment.
  const byId = new Map(treatments.filter(t => !t.is_addon).map(t => [t.id, t]));
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
  settings: InboxSettingsRow | null;
  identity: ClientIdentity;
  previousMessages: ThreadMessage[];
  treatments: TreatmentRow[];
  requestedDate: string | null;
  availabilityChecked: boolean;
  availabilityCheckFailed: boolean;
  availableSlots: string[];
  treatmentAvailabilities: TreatmentAvailability[];
  publicCatalogUrl: string | null;
  publicTreatmentLinks: PublicTreatmentLink[];
}): string {
  const { inquiry, hotel, settings, identity, previousMessages, treatments, requestedDate, availabilityChecked, availabilityCheckFailed, availableSlots, treatmentAvailabilities, publicCatalogUrl, publicTreatmentLinks } = args;
  const p = inquiry.parsed_data ?? {};

  const bookable = treatments.filter(t => !t.is_addon);
  const addons = treatments.filter(t => t.is_addon);
  const treatmentList = bookable.map(formatTreatmentLine).join("\n") || "(no treatments configured)";
  const addonList = addons.map(formatTreatmentLine).join("\n");

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
  if (p.requested_date) parsedHints.push(`Requested date: ${p.requested_date}`);
  if (p.requested_time) parsedHints.push(`Requested time: ${p.requested_time}`);
  if (p.guest_count) parsedHints.push(`Guest count: ${p.guest_count}`);
  // Rows parsed before add-ons were excluded can still carry one as a match — never
  // surface it as a bookable suggestion.
  const isAddonId = (id: string | null | undefined) =>
    Boolean(id) && Boolean(treatments.find(x => x.id === id)?.is_addon);

  if (p.treatment_match?.id && !isAddonId(p.treatment_match.id)) {
    const t = treatments.find(x => x.id === p.treatment_match?.id);
    parsedHints.push(`Likely treatment: ${t?.name ?? t?.name_en ?? p.treatment_match.id}`);
  }
  const bookableCandidates = (p.treatment_candidates ?? []).filter(c => !isAddonId(c.id));
  if (bookableCandidates.length > 0) {
    const candidateText = bookableCandidates
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
  if (typeof p.intent_confidence === "number") {
    parsedHints.push(
      `Booking intent: ${Math.round(clamp01(p.intent_confidence) * 100)}%${p.intent_confidence < 0.4 ? " — treat this as a question to answer, not as a booking request" : ""}`,
    );
  }
  if (p.notes) parsedHints.push(`Notes: ${p.notes}`);

  return [
    `Venue: ${hotel?.name ?? "(unknown)"}`,
    `Venue opening hours: ${hotel?.opening_time ?? "?"} – ${hotel?.closing_time ?? "?"}`,
    `Original sender: ${inquiry.from_address}`,
    `Original subject: ${inquiry.subject ?? "(no subject)"}`,
    ``,
    buildClientIdentityBlock(identity, p, inquiry),
    ``,
    `What we extracted from the email:`,
    parsedHints.length > 0 ? parsedHints.map(h => `  ${h}`).join("\n") : "  (nothing actionable)",
    ``,
    `Bookable treatments:`,
    treatmentList,
    ...(addonList
      ? [
        ``,
        `Add-ons — complements only. They CANNOT be booked alone and must never be proposed as a standalone appointment:`,
        addonList,
      ]
      : []),
    ``,
    availabilityBlock,
    ``,
    publicLinksBlock,
    ``,
    buildKnowledgeBlock(hotel, settings),
    ``,
    ...(previousMessages.length > 0 ? [buildThreadBlock(previousMessages), ``] : []),
    `Original email body:`,
    body,
    ``,
    `Now draft the reply as a single JSON object { "subject", "body", "language" }.`,
  ].join("\n");
}

function formatTreatmentLine(t: TreatmentRow): string {
  const price = formatPrice(t.price, t.price_on_request);
  const duration = t.duration != null ? `${t.duration}min` : "?";
  const head = `- id=${t.id} | name="${t.name ?? t.name_en ?? ""}" | duration=${duration} | price=${price}`;
  // Variants carry the real durations and prices the client asks for ("90 minute massage").
  const variants = t.variants
    .filter(v => v.duration != null || v.price != null)
    .map(v => {
      const guests = v.guest_count != null && v.guest_count > 1 ? ` | ${v.guest_count} guests` : "";
      return `    · ${v.duration ?? "?"}min | ${formatPrice(v.price, v.price_on_request)}${guests}${v.is_default ? " | default" : ""}`;
    });
  return variants.length > 1 ? [head, ...variants].join("\n") : head;
}

function formatPrice(price: number | null, onRequest: boolean): string {
  if (onRequest) return "on request";
  return price != null ? `${price}€` : "?";
}

// Tells the model exactly how much of the client's identity is trustworthy, so it can
// apply the salutation cascade instead of defaulting to "Dear Guest".
function buildClientIdentityBlock(
  identity: ClientIdentity,
  parsed: ParsedDataShape,
  inquiry: InquiryRow,
): string {
  const lines: string[] = ["Client identity:"];
  lines.push(`  First name: ${identity.firstName ?? "(unknown)"}`);
  lines.push(`  Last name: ${identity.lastName ?? "(unknown)"}`);
  lines.push(
    identity.civility
      ? `  Civility: ${identity.civility} (explicit — you may use it with the last name)`
      : `  Civility: (unknown — do NOT guess one)`,
  );
  if (identity.source === "customer") {
    lines.push(`  Source: existing customer record (curated by the venue)`);
  }

  const clientEmail = parsed.email?.trim() ?? null;
  if (clientEmail && clientEmail.toLowerCase() !== inquiry.from_address.toLowerCase()) {
    lines.push(
      `  Reply recipient: ${clientEmail} — this email was forwarded by ${inquiry.from_address}. Write to the client, not to the person who forwarded it.`,
    );
  } else {
    lines.push(`  Reply recipient: ${clientEmail ?? inquiry.from_address}`);
  }
  return lines.join("\n");
}

function buildKnowledgeBlock(hotel: HotelRow | null, settings: InboxSettingsRow | null): string {
  const sections: string[] = [];
  const knowledge = [settings?.knowledge_base_fr, settings?.knowledge_base_en]
    .filter((s): s is string => Boolean(s?.trim()))
    .map(s => s.trim());
  if (knowledge.length > 0) sections.push(knowledge.join("\n\n"));

  const description = hotel?.description?.trim() || hotel?.description_en?.trim();
  if (description) sections.push(`Venue description: ${description}`);

  const cancellation = hotel?.cancellation_policy_text_fr?.trim() || hotel?.cancellation_policy_text_en?.trim();
  if (cancellation) sections.push(`Cancellation policy: ${cancellation}`);

  const location = [hotel?.address, hotel?.city].filter(Boolean).join(", ");
  if (location) sections.push(`Address: ${location}`);
  if (hotel?.website_url?.trim()) sections.push(`Website: ${hotel.website_url.trim()}`);

  if (sections.length === 0) {
    return "Venue knowledge base: empty. Anything outside the treatment menu is unknown — do not state prices, packages, hours or facilities that are not listed above.";
  }
  return [
    "Venue knowledge base (authoritative — never state anything beyond it):",
    ...sections,
  ].join("\n");
}

function buildThreadBlock(messages: ThreadMessage[]): string {
  const lines = messages.map(m => {
    const who = m.direction === "outbound" ? "Venue" : "Client";
    const text = m.raw_body_text?.trim() || stripHtml(m.raw_body_html ?? "");
    return `- [${m.created_at.slice(0, 10)}] ${who}: ${text.slice(0, 600)}`;
  });
  return ["Previous messages in this thread (oldest first):", ...lines].join("\n");
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
