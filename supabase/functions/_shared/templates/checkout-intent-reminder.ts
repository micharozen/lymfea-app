// "Abandoned checkout" reminder email — same sable / clay design system as
// booking-confirmed.ts (Newsreader + DM Sans + IBM Plex Mono), composed from the
// shared primitives in email-layout.ts: header with status pill, serif hero with
// a clay <em>, cart list + total block, primary button, hint line, footer.
//
// The cart lines are pre-rendered into `items_html` by
// buildCheckoutIntentReminderVars(); placeholders are filled by renderTemplate().
import {
  AMBER,
  AMBER_TINT,
  CLAY,
  type EmailCopy,
  FONT_SANS,
  FONT_SERIF,
  footer,
  header,
  hero,
  INK,
  INK_MUTE,
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
  formatBookingDate,
  formatVenueAddress,
  type Lang,
  venueLogoUrl,
} from "../booking-email-vars.ts";

export interface CheckoutIntentReminderItem {
  name: string;
  quantity: number;
  /** `null` when the treatment is priced on request. */
  price: number | null;
  /** Sub-line under the name (e.g. the variant label "60 min"). */
  meta?: string | null;
}

export interface CheckoutIntentReminderContext {
  lang: Lang;
  firstName: string;
  venueName: string;
  venue?: EmailVenue | null;
  items: CheckoutIntentReminderItem[];
  total: number | null;
  /** ISO currency code from the cart snapshot. */
  currency: string;
  /** ISO date of the slot the guest had selected, when there was one. */
  bookingDate?: string | null;
  resumeUrl: string;
}

interface ReminderCopy extends EmailCopy {
  sectionTitle: string;
  btnResume: string;
  onRequest: string;
  hint: (date: string) => string;
  subject: (venue: string) => string;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

function reminderTemplate(copy: ReminderCopy): string {
  const button =
    `<tr><td class="eia-sect" style="padding:28px 40px 0">${primaryButton("{{{resume_url}}}", copy.btnResume)}</td></tr>`;
  const body =
    header(copy) +
    hero(copy) +
    treatmentsSection(copy) +
    button +
    "{{{hint_html}}}" +
    footer(copy);
  return shell(copy, body);
}

// ---------------------------------------------------------------------------
// Copy decks
// ---------------------------------------------------------------------------

const COPY_FR: ReminderCopy = {
  lang: "fr",
  preheader: "Votre sélection de soins vous attend encore.",
  pill: "Panier en attente",
  pillColor: AMBER,
  pillTint: AMBER_TINT,
  showGreeting: true,
  greetPrefix: "Bonjour",
  heading: "À quelques instants de <em style=\"font-style:italic;color:" + CLAY + "\">l'évasion</em>.",
  intro: "Votre sélection chez {{{venue_name}}} est toujours là. Reprenez votre réservation là où vous l'avez laissée.",
  labelWhen: "",
  labelWhere: "",
  totalLabel: "Total",
  arriveNote: "",
  sectionTitle: "Votre sélection",
  btnResume: "Reprendre ma réservation",
  onRequest: "Sur devis",
  hint: (date: string) => `Votre créneau du ${date} est maintenu encore 48 h.`,
  subject: (venue: string) => `Votre parenthèse chez ${venue} vous attend`,
  footerContactLabel: "Une question ?",
};

const COPY_EN: ReminderCopy = {
  lang: "en",
  preheader: "Your selection of treatments is still waiting.",
  pill: "Cart on hold",
  pillColor: AMBER,
  pillTint: AMBER_TINT,
  showGreeting: true,
  greetPrefix: "Hello",
  heading: "A few clicks from your <em style=\"font-style:italic;color:" + CLAY + "\">escape</em>.",
  intro: "Your selection at {{{venue_name}}} is still there. Pick up your booking right where you left it.",
  labelWhen: "",
  labelWhere: "",
  totalLabel: "Total",
  arriveNote: "",
  sectionTitle: "Your selection",
  btnResume: "Resume my booking",
  onRequest: "On request",
  hint: (date: string) => `Your ${date} slot is held for another 48 hrs.`,
  subject: (venue: string) => `Your escape at ${venue} is waiting`,
  footerContactLabel: "A question?",
};

const COPY: Record<Lang, ReminderCopy> = { fr: COPY_FR, en: COPY_EN };

export const CHECKOUT_INTENT_REMINDER_HTML_FR = reminderTemplate(COPY_FR);
export const CHECKOUT_INTENT_REMINDER_HTML_EN = reminderTemplate(COPY_EN);

// ---------------------------------------------------------------------------
// Fragments + vars
// ---------------------------------------------------------------------------

/** One cart line per item — name (+ quantity / variant) left, price right. */
function itemsHtml(items: CheckoutIntentReminderItem[], copy: ReminderCopy, sym: string): string {
  return items
    .map((item) => {
      const meta = item.meta
        ? `<span style="display:block;margin-top:2px;font-family:${FONT_SANS};font-size:12px;color:${INK_MUTE}">${escapeHtml(item.meta)}</span>`
        : "";
      const quantity = item.quantity > 1 ? ` × ${item.quantity}` : "";
      const price = item.price == null ? copy.onRequest : `${item.price} ${sym}`;
      return `<tr><td style="padding:12px 0;border-bottom:1px solid ${LINE_SOFT};font-family:${FONT_SANS};font-size:15px;color:${INK}">${escapeHtml(item.name)}${quantity}${meta}</td><td align="right" style="padding:12px 0 12px 16px;border-bottom:1px solid ${LINE_SOFT};font-family:${FONT_SERIF};font-size:16px;color:${INK};white-space:nowrap;vertical-align:top">${escapeHtml(price)}</td></tr>`;
    })
    .join("");
}

/** Centered muted line under the button — '' when no slot was selected. */
function hintHtml(copy: ReminderCopy, bookingDate: string | null | undefined): string {
  if (!bookingDate) return "";
  const date = formatBookingDate(bookingDate, copy.lang);
  return `<tr><td align="center" class="eia-sect" style="padding:16px 40px 0;text-align:center"><p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(copy.hint(date))}</p></td></tr>`;
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
    contact_email: escapeHtml(ctx.venue?.contact_email),
    client_name: escapeHtml(ctx.firstName),
    section_title: copy.sectionTitle,
    treatments_html: itemsHtml(ctx.items, copy, sym),
    total_price: ctx.total == null ? copy.onRequest : `${ctx.total} ${sym}`,
    resume_url: ctx.resumeUrl,
    hint_html: hintHtml(copy, ctx.bookingDate),
  };
}

export function getCheckoutIntentReminderHtml(ctx: CheckoutIntentReminderContext): string {
  const html = ctx.lang === "en"
    ? CHECKOUT_INTENT_REMINDER_HTML_EN
    : CHECKOUT_INTENT_REMINDER_HTML_FR;
  return renderTemplate(html, buildCheckoutIntentReminderVars(ctx));
}
