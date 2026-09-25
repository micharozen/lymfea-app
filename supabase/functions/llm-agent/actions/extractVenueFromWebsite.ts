// Reads a venue's public website (home + a few relevant internal pages) and
// asks the LLM to extract onboarding answers. Output keys mirror the venue
// setup wizard sections (_shared/venueSetup/spec.ts); the caller sanitizes
// them and only fills empty fields.

import { callAnthropic, safeParseJsonObject } from "../../_shared/anthropic-client.ts";
import { safeFetch } from "../../_shared/safeFetch.ts";

const MAX_PAGE_BYTES = 1_500_000;
const MAX_EXTRA_PAGES = 4;
const MAX_CHARS_PER_PAGE = 12_000;

// Internal pages worth reading, by URL or link text.
const INTERESTING = /(spa|soin|treatment|wellness|bien-?etre|contact|acc[eè]s|access|horaire|hours|mention|legal|l[eé]gal|cgv|conditions|terms|annulation|cancel|about|a-propos|qui-sommes)/i;

export interface WebsiteExtraction {
  organization: Record<string, unknown>;
  hotel: Record<string, unknown>;
  amenity_types: string[];
  cover_image_url: string | null;
  pages_read: string[];
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']+)["']/i)?.[1] ?? null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr|section|footer|header)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function internalLinks(html: string, base: URL): URL[] {
  const found = new Map<string, URL>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(m[1], base);
      if (url.hostname !== base.hostname || !/^https?:$/.test(url.protocol)) continue;
      if (/\.(pdf|jpe?g|png|gif|webp|svg|zip)$/i.test(url.pathname)) continue;
      const text = htmlToText(m[2]);
      if (!INTERESTING.test(url.pathname) && !INTERESTING.test(text)) continue;
      url.hash = "";
      const key = url.toString();
      if (key !== base.toString() && !found.has(key)) found.set(key, url);
    } catch {
      // ignore malformed href
    }
  }
  return [...found.values()].slice(0, MAX_EXTRA_PAGES);
}

const SYSTEM_PROMPT = `Tu aides un spa (souvent un spa d'hôtel) à remplir son formulaire d'onboarding sur un logiciel de réservation.
On te donne le texte de pages de son site web. Extrais UNIQUEMENT ce qui est explicitement écrit, n'invente rien.
Réponds par un unique objet JSON, sans texte autour, avec ce schéma (omets une clé si l'info est absente) :
{
  "organization": {
    "commercial_name": string, "legal_name": string, "legal_form": string, "legal_capital": string,
    "siren": "9 chiffres", "siret": "14 chiffres", "vat_number": string,
    "legal_address": string, "legal_postal_code": string, "legal_city": string, "legal_country": string
  },
  "hotel": {
    "name": "nom du spa ou du lieu", "venue_type": "hotel" | "spa",
    "landing_subtitle": "accroche courte FR (< 120 car.)", "landing_subtitle_en": "same in English",
    "description": "présentation FR du spa, 2-4 phrases", "description_en": "same in English",
    "contact_email": string, "address": "numéro et rue", "postal_code": string, "city": string,
    "country": "nom du pays en anglais, minuscules (ex: france)",
    "opening_time": "HH:MM", "closing_time": "HH:MM",
    "access_instructions": "comment venir / accès au spa, FR", "access_instructions_en": "EN",
    "cancellation_policy_text_fr": "politique d'annulation telle qu'écrite", "cancellation_policy_text_en": "EN"
  },
  "amenity_types": ["pool" | "fitness" | "sauna" | "hammam" | "jacuzzi"]
}
Règles : venue_type = "hotel" si le spa fait partie d'un hôtel, sinon "spa". Les infos légales (SIREN, SIRET, raison sociale, capital) viennent en général des mentions légales. Traduis toi-même les champs _en si le site est seulement en français (et inversement pour les champs FR).`;

export async function extractVenueFromWebsite(rawUrl: string): Promise<{ result: WebsiteExtraction | null; error: string | null }> {
  let home;
  try {
    home = await safeFetch(rawUrl, MAX_PAGE_BYTES);
  } catch (err) {
    return { result: null, error: `fetch_failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!home.ok || !home.contentType.includes("html")) {
    return { result: null, error: `fetch_failed: status ${home.status}` };
  }

  const homeHtml = decode(home.bytes);
  const base = new URL(home.url);
  const ogImage = metaContent(homeHtml, "og:image");
  const pages: { url: string; text: string }[] = [
    { url: home.url, text: htmlToText(homeHtml).slice(0, MAX_CHARS_PER_PAGE) },
  ];

  const extra = await Promise.all(
    internalLinks(homeHtml, base).map(async (u) => {
      try {
        const page = await safeFetch(u.toString(), MAX_PAGE_BYTES);
        if (!page.ok || !page.contentType.includes("html")) return null;
        return { url: page.url, text: htmlToText(decode(page.bytes)).slice(0, MAX_CHARS_PER_PAGE) };
      } catch {
        return null;
      }
    }),
  );
  for (const p of extra) if (p && p.text) pages.push(p);

  const userMessage = pages.map((p) => `### Page : ${p.url}\n${p.text}`).join("\n\n");
  const { text, error } = await callAnthropic({ systemPrompt: SYSTEM_PROMPT, userMessage, maxTokens: 2000 });
  if (error) return { result: null, error };

  const raw = safeParseJsonObject<Partial<WebsiteExtraction>>(text);
  if (!raw) return { result: null, error: "Model output was not valid JSON" };

  let cover: string | null = null;
  if (ogImage) {
    try {
      cover = new URL(ogImage, base).toString();
    } catch {
      cover = null;
    }
  }

  return {
    result: {
      organization: (raw.organization && typeof raw.organization === "object" ? raw.organization : {}) as Record<string, unknown>,
      hotel: { ...(raw.hotel && typeof raw.hotel === "object" ? raw.hotel : {}), website_url: base.origin },
      amenity_types: Array.isArray(raw.amenity_types) ? raw.amenity_types.filter((t): t is string => typeof t === "string") : [],
      cover_image_url: cover,
      pages_read: pages.map((p) => p.url),
    },
    error: null,
  };
}
