// "Abandoned checkout" reminder email — full-width editorial layout inspired by
// Staycation's reminder, rendered in the Saoma design system (sable / clay,
// Newsreader + DM Sans + IBM Plex Mono). Everything left-aligned, no card:
// logo, one big serif line, a large venue photo, the cart list + total, one
// compact ink CTA with a reassurance line, then an address-only footer with
// the opt-out link.
//
// This template deliberately does NOT use the shared shell/section primitives
// from email-layout.ts (they render the framed 600px card used by the
// transactional emails); it defines its own full-width blocks and only shares
// the palette and fonts.
//
// Urgency copy is deliberately never a countdown: the 5-minute slot hold has
// long expired when the reminder goes out, so the venue is not holding
// anything. Claiming otherwise would be a misleading commercial practice.
//
// The cart lines are pre-rendered into `treatments_html` by
// buildCheckoutIntentReminderVars(); placeholders are filled by renderTemplate().
import {
  CLAY,
  FONT_MONO,
  FONT_SANS,
  FONT_SERIF,
  INK,
  INK_MUTE,
  LINE,
  LINE_SOFT,
  SAND_50,
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

interface ReminderCopy {
  lang: Lang;
  preheader: string;
  /** Big serif line, may contain a clay <em>. */
  heading: string;
  totalLabel: string;
  btnResume: string;
  /** Objection-lifting microcopy under the CTA. */
  reassurance: string;
  onRequest: string;
  unsubscribe: string;
  subject: (venue: string) => string;
}

// ---------------------------------------------------------------------------
// Layout — full-width sand page, 680px left-aligned content column
// ---------------------------------------------------------------------------

const CONTENT_WIDTH = 680;

function wideShell(copy: ReminderCopy, body: string): string {
  return `<!DOCTYPE html><html lang="${copy.lang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="X-UA-Compatible" content="IE=edge"/><meta name="x-apple-disable-message-reformatting"/><meta name="color-scheme" content="light"/><link href="https://fonts.googleapis.com/css2?family=Newsreader:ital@0;1&family=DM+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/><style>@media only screen and (max-width:520px){.sao-pad{padding-left:24px !important;padding-right:24px !important}.sao-h1{font-size:30px !important;line-height:1.2 !important}}</style></head><body style="margin:0;padding:0;background-color:${SAND_50}"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${copy.preheader}</div><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${SAND_50}"><tbody><tr><td align="center"><!--[if mso]><table role="presentation" width="${CONTENT_WIDTH}"><tr><td><![endif]--><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:${CONTENT_WIDTH}px"><tbody>${body}</tbody></table><!--[if mso]></td></tr></table><![endif]--></td></tr></tbody></table></body></html>`;
}

/** Venue logo alone, left-aligned (the logo carries the venue identity). */
function wideHeader(): string {
  return `<tr><td class="sao-pad" style="padding:28px 48px 0"><img src="{{{logo_url}}}" alt="{{{venue_name}}}" height="44" style="display:block;height:44px;max-height:44px"/></td></tr>`;
}

/** Big serif heading, left-aligned. The only sentence in the email. */
function wideHero(copy: ReminderCopy): string {
  return `<tr><td class="sao-pad" style="padding:22px 48px 0"><h1 class="sao-h1" style="margin:0;font-family:${FONT_SERIF};font-size:34px;font-weight:400;line-height:1.15;color:${INK}">${copy.heading}</h1></td></tr>`;
}

/** Compact ink CTA, left-aligned, with the reassurance microcopy below. */
function ctaHtml(copy: ReminderCopy): string {
  return `<tr><td class="sao-pad" style="padding:24px 48px 0"><a href="{{{resume_url}}}" target="_blank" rel="noopener noreferrer nofollow" style="display:inline-block;text-decoration:none;font-family:${FONT_SANS};font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-weight:500;padding:17px 34px;border-radius:10px;background-color:${INK};color:#FFFFFF;border:1px solid ${INK}">${copy.btnResume}</a><p style="margin:14px 0 0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${INK_MUTE}">${copy.reassurance}</p></td></tr>`;
}

/** Address-only footer: top rule, mono venue address, opt-out link. */
function wideFooter(copy: ReminderCopy): string {
  return `<tr><td class="sao-pad" style="padding:40px 48px 40px"><div style="border-top:1px solid ${LINE};padding-top:24px"><p style="margin:0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.14em;line-height:1.8;text-transform:uppercase;color:${INK_MUTE}">{{{venue_address}}}</p><p style="margin:12px 0 0"><a href="{{{unsubscribe_url}}}" target="_blank" rel="noopener noreferrer nofollow" style="font-family:${FONT_SANS};font-size:11px;color:${INK_MUTE};text-decoration:underline">${copy.unsubscribe}</a></p></div></td></tr>`;
}

/** Cart section: compact item lines, then the total row. */
function selectionSection(copy: ReminderCopy): string {
  return `<tr><td class="sao-pad" style="padding:20px 48px 0"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tbody>{{{treatments_html}}}<tr><td style="padding:10px 0 0;font-family:${FONT_MONO};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${CLAY}">${copy.totalLabel}</td><td align="right" style="padding:10px 0 0;font-family:${FONT_SERIF};font-size:20px;color:${INK};white-space:nowrap">{{{total_price}}}</td></tr></tbody></table></td></tr>`;
}

function reminderTemplate(copy: ReminderCopy): string {
  const body =
    wideHeader() +
    wideHero(copy) +
    "{{{photo_html}}}" +
    selectionSection(copy) +
    ctaHtml(copy) +
    wideFooter(copy);
  return wideShell(copy, body);
}

// ---------------------------------------------------------------------------
// Copy decks
// ---------------------------------------------------------------------------

const COPY_FR: ReminderCopy = {
  lang: "fr",
  preheader: "Votre sélection est toujours disponible — il ne reste qu'une étape.",
  heading: "À quelques instants de <em style=\"font-style:italic;color:" + CLAY + "\">l'évasion</em>.",
  totalLabel: "Total",
  btnResume: "Finaliser ma réservation",
  reassurance: "Confirmation immédiate · Paiement sécurisé",
  onRequest: "Sur devis",
  unsubscribe: "Se désabonner",
  subject: (venue: string) => `Votre parenthèse chez ${venue} vous attend`,
};

const COPY_EN: ReminderCopy = {
  lang: "en",
  preheader: "Your selection is still available — just one step left.",
  heading: "A few clicks from your <em style=\"font-style:italic;color:" + CLAY + "\">escape</em>.",
  totalLabel: "Total",
  btnResume: "Complete my booking",
  reassurance: "Instant confirmation · Secure payment",
  onRequest: "On request",
  unsubscribe: "Unsubscribe",
  subject: (venue: string) => `Your escape at ${venue} is waiting`,
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
  // Fixed cropped height keeps the CTA above the fold; object-fit is honoured
  // by Apple Mail / Gmail, other clients just show the image uncropped.
  return `<tr><td class="sao-pad" style="padding:20px 48px 0"><img src="${escapeHtml(url)}" alt="{{{venue_name}}}" width="${CONTENT_WIDTH - 96}" height="230" style="display:block;width:100%;height:230px;object-fit:cover;border-radius:12px"/></td></tr>`;
}

/** A variant label that only restates the duration ("60 min", "1h30"). */
const BARE_DURATION = /^\d+\s*(min(utes?)?|h|h\s*\d+|heures?)$/i;

/** One cart line per item — bold name, grey meta below, serif price right. */
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
        ? `<span style="font-family:${FONT_SANS};font-size:12px;font-weight:400;color:${INK_MUTE}"> · ${escapeHtml(metaText)}</span>`
        : "";
      const quantity = item.quantity > 1 ? ` × ${item.quantity}` : "";
      const price = item.price == null ? copy.onRequest : `${item.price} ${sym}`;
      return `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE_SOFT};font-family:${FONT_SANS};font-size:15px;font-weight:700;color:${INK}">${escapeHtml(item.name)}${quantity}${meta}</td><td align="right" style="padding:9px 0 9px 16px;border-bottom:1px solid ${LINE_SOFT};font-family:${FONT_SERIF};font-size:16px;color:${INK};white-space:nowrap;vertical-align:top">${escapeHtml(price)}</td></tr>`;
    })
    .join("");
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
    photo_html: photoHtml(ctx.venue),
    treatments_html: itemsHtml(ctx.items, copy, sym),
    total_price: ctx.total == null ? copy.onRequest : `${ctx.total} ${sym}`,
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
