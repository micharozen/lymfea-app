// "Abandoned checkout" reminder email — pared-down version of the sable / clay
// design system (Newsreader + DM Sans + IBM Plex Mono). Deliberately minimal:
// logo, one serif line, a large venue photo, the cart list, one button, one
// slot line, then an address-only footer with the opt-out link. No greeting,
// no intro, no pill, no secondary links.
//
// Urgency copy is deliberately never a countdown: the 5-minute slot hold has
// long expired when the reminder goes out, so the venue is not holding anything.
// Claiming otherwise would be a misleading commercial practice — "votre créneau
// vous attend" states an invitation, not a reservation.
//
// The cart lines are pre-rendered into `treatments_html` by
// buildCheckoutIntentReminderVars(); placeholders are filled by renderTemplate().
import {
  CLAY,
  type EmailCopy,
  FONT_MONO,
  FONT_SANS,
  FONT_SERIF,
  INK,
  INK_MUTE,
  LINE,
  LINE_SOFT,
  primaryButton,
  shell,
  treatmentsSection,
} from "./email-layout.ts";
import { renderTemplate } from "./render.ts";
import {
  currencySymbol,
  type EmailVenue,
  escapeHtml,
  formatTotalDuration,
  formatVenueAddress,
  type Lang,
  venueLogoUrl,
} from "../booking-email-vars.ts";

export interface CheckoutIntentReminderItem {
  name: string;
  quantity: number;
  /** `null` when the treatment is priced on request. */
  price: number | null;
  /** Variant label ("Signature 90 min") — `null` for a plain treatment. */
  variantLabel?: string | null;
  /** Minutes, resolved from the variant then the treatment. `null` if unknown. */
  duration?: number | null;
}

export interface CheckoutIntentReminderContext {
  lang: Lang;
  venueName: string;
  venue?: EmailVenue | null;
  items: CheckoutIntentReminderItem[];
  total: number | null;
  /** ISO currency code from the cart snapshot. */
  currency: string;
  resumeUrl: string;
  unsubscribeUrl: string;
}

interface ReminderCopy extends EmailCopy {
  sectionTitle: string;
  btnResume: string;
  onRequest: string;
  unsubscribe: string;
  subject: (venue: string) => string;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

/** Header stripped down to the venue logo + uppercase venue name (no pill). */
function minimalHeader(): string {
  return `<tr><td align="center" class="eia-sect" style="padding:40px 40px 0"><img src="{{{logo_url}}}" alt="{{{venue_name}}}" height="64" style="display:block;height:64px;max-height:64px;margin:0 auto"/><p style="margin:20px 0 0;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:${INK}">{{{venue_name}}}</p></td></tr>`;
}

/** Serif heading alone — no greeting line, no intro paragraph. */
function minimalHero(copy: ReminderCopy): string {
  return `<tr><td align="center" class="eia-sect" style="padding:28px 40px 0"><h1 style="margin:0;font-family:${FONT_SERIF};font-size:28px;font-weight:400;line-height:1.25;color:${INK}">${copy.heading}</h1></td></tr>`;
}

/** Address-only footer: top rule, mono venue address. Nothing else. */
function minimalFooter(): string {
  return `<tr><td align="center" class="eia-sect" style="padding:32px 40px 12px;text-align:center"><div style="border-top:1px solid ${LINE};padding-top:24px"><p style="margin:0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.14em;line-height:1.8;text-transform:uppercase;color:${INK_MUTE}">{{{venue_address}}}</p></div></td></tr>`;
}

function reminderTemplate(copy: ReminderCopy): string {
  const button =
    `<tr><td class="eia-sect" style="padding:24px 40px 0">${primaryButton("{{{resume_url}}}", copy.btnResume)}</td></tr>`;
  const body =
    minimalHeader() +
    minimalHero(copy) +
    "{{{photo_html}}}" +
    treatmentsSection(copy) +
    button +
    minimalFooter() +
    "{{{unsubscribe_html}}}";
  return shell(copy, body);
}

// ---------------------------------------------------------------------------
// Copy decks
// ---------------------------------------------------------------------------

// pill / greeting / intro / footer-contact fields are required by EmailCopy but
// unused here — this template renders none of those blocks.
const COPY_FR: ReminderCopy = {
  lang: "fr",
  preheader: "Votre sélection de soins vous attend encore.",
  pill: "",
  pillColor: "",
  pillTint: "",
  showGreeting: false,
  greetPrefix: "",
  heading: "À quelques instants de <em style=\"font-style:italic;color:" + CLAY + "\">l'évasion</em>.",
  intro: "",
  labelWhen: "",
  labelWhere: "",
  totalLabel: "Total",
  arriveNote: "",
  sectionTitle: "Votre sélection",
  btnResume: "Reprendre ma réservation",
  onRequest: "Sur devis",
  unsubscribe: "Se désabonner",
  subject: (venue: string) => `Votre parenthèse chez ${venue} vous attend`,
  footerContactLabel: "",
};

const COPY_EN: ReminderCopy = {
  lang: "en",
  preheader: "Your selection of treatments is still waiting.",
  pill: "",
  pillColor: "",
  pillTint: "",
  showGreeting: false,
  greetPrefix: "",
  heading: "A few clicks from your <em style=\"font-style:italic;color:" + CLAY + "\">escape</em>.",
  intro: "",
  labelWhen: "",
  labelWhere: "",
  totalLabel: "Total",
  arriveNote: "",
  sectionTitle: "Your selection",
  btnResume: "Resume my booking",
  onRequest: "On request",
  unsubscribe: "Unsubscribe",
  subject: (venue: string) => `Your escape at ${venue} is waiting`,
  footerContactLabel: "",
};

const COPY: Record<Lang, ReminderCopy> = { fr: COPY_FR, en: COPY_EN };

export const CHECKOUT_INTENT_REMINDER_HTML_FR = reminderTemplate(COPY_FR);
export const CHECKOUT_INTENT_REMINDER_HTML_EN = reminderTemplate(COPY_EN);

// ---------------------------------------------------------------------------
// Fragments + vars
// ---------------------------------------------------------------------------

/** Large rounded venue photo under the heading — '' when the venue has none.
 * Same https-only rule as the logo: a local-dev URL renders as a broken image. */
function photoHtml(venue: EmailVenue | null | undefined): string {
  const url = venue?.cover_image?.trim();
  if (!url || !/^https:\/\//i.test(url)) return "";
  return `<tr><td class="eia-sect" style="padding:28px 40px 0"><img src="${escapeHtml(url)}" alt="{{{venue_name}}}" width="520" style="display:block;width:100%;height:auto;border-radius:14px;border:1px solid ${LINE_SOFT}"/></td></tr>`;
}

/** A variant label that only restates the duration ("60 min", "1h30"). */
const BARE_DURATION = /^\d+\s*(min(utes?)?|h|h\s*\d+|heures?)$/i;

/** One cart line per item — name (+ quantity / variant / duration) left, price right. */
function itemsHtml(items: CheckoutIntentReminderItem[], copy: ReminderCopy, sym: string): string {
  return items
    .map((item) => {
      // Every line carries its duration. The variant label is prepended only when
      // it names something ("Signature"); a label that is itself a duration would
      // otherwise render as "60 min · 1 h".
      const durationLabel = item.duration ? formatTotalDuration(item.duration) : "";
      const variantLabel = item.variantLabel?.trim();
      const parts = [
        variantLabel && !BARE_DURATION.test(variantLabel) ? variantLabel : "",
        durationLabel || variantLabel || "",
      ].filter(Boolean);
      const metaText = [...new Set(parts)].join(" · ");
      const meta = metaText
        ? `<span style="display:block;margin-top:2px;font-family:${FONT_SANS};font-size:12px;color:${INK_MUTE}">${escapeHtml(metaText)}</span>`
        : "";
      const quantity = item.quantity > 1 ? ` × ${item.quantity}` : "";
      const price = item.price == null ? copy.onRequest : `${item.price} ${sym}`;
      return `<tr><td style="padding:12px 0;border-bottom:1px solid ${LINE_SOFT};font-family:${FONT_SANS};font-size:15px;color:${INK}">${escapeHtml(item.name)}${quantity}${meta}</td><td align="right" style="padding:12px 0 12px 16px;border-bottom:1px solid ${LINE_SOFT};font-family:${FONT_SERIF};font-size:16px;color:${INK};white-space:nowrap;vertical-align:top">${escapeHtml(price)}</td></tr>`;
    })
    .join("");
}

/** RGPD opt-out line, below the footer rule. */
function unsubscribeHtml(copy: ReminderCopy): string {
  return `<tr><td align="center" class="eia-sect" style="padding:0 40px 32px;text-align:center"><a href="{{{unsubscribe_url}}}" target="_blank" rel="noopener noreferrer nofollow" style="font-family:${FONT_SANS};font-size:11px;color:${INK_MUTE};text-decoration:underline">${copy.unsubscribe}</a></td></tr>`;
}

export function getCheckoutIntentReminderSubject(lang: Lang, venueName: string): string {
  return COPY[lang].subject(venueName);
}

export function buildCheckoutIntentReminderVars(
  ctx: CheckoutIntentReminderContext,
): Record<string, string> {
  const copy = COPY[ctx.lang];
  const sym = currencySymbol(ctx.currency);

  return {
    logo_url: venueLogoUrl(ctx.venue),
    venue_name: escapeHtml(ctx.venueName),
    venue_address: escapeHtml(formatVenueAddress(ctx.venue)),
    section_title: copy.sectionTitle,
    photo_html: photoHtml(ctx.venue),
    treatments_html: itemsHtml(ctx.items, copy, sym),
    total_price: ctx.total == null ? copy.onRequest : `${ctx.total} ${sym}`,
    unsubscribe_html: unsubscribeHtml(copy),
    resume_url: ctx.resumeUrl,
    unsubscribe_url: ctx.unsubscribeUrl,
  };
}

export function getCheckoutIntentReminderHtml(ctx: CheckoutIntentReminderContext): string {
  const html = ctx.lang === "en"
    ? CHECKOUT_INTENT_REMINDER_HTML_EN
    : CHECKOUT_INTENT_REMINDER_HTML_FR;
  return renderTemplate(html, buildCheckoutIntentReminderVars(ctx));
}
