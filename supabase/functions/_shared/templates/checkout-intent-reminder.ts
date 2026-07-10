// "Abandoned checkout" reminder email — same sable / clay design system as
// booking-confirmed.ts (Newsreader + DM Sans + IBM Plex Mono), composed from the
// shared primitives in email-layout.ts: header with status pill, serif hero with
// a clay <em>, requested-slot card, cart list + total block, primary button,
// reassurance line, secondary link, footer + unsubscribe.
//
// Urgency copy is deliberately never a countdown: the 5-minute slot hold has
// long expired when the reminder goes out, so the venue is not holding anything.
// Claiming otherwise would be a misleading commercial practice — and would read
// absurd on a slot dated tomorrow. We state scarcity, not a reservation.
//
// The cart lines are pre-rendered into `treatments_html` by
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
  ICON_CALENDAR,
  INK,
  INK_MUTE,
  keyRow,
  LINE_SOFT,
  primaryButton,
  SAND_100,
  shell,
  treatmentsSection,
} from "./email-layout.ts";
import { renderTemplate } from "./render.ts";
import {
  currencySymbol,
  type EmailVenue,
  escapeHtml,
  formatBookingDate,
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
  firstName: string;
  venueName: string;
  venue?: EmailVenue | null;
  items: CheckoutIntentReminderItem[];
  total: number | null;
  /** ISO currency code from the cart snapshot. */
  currency: string;
  /** ISO date of the slot the guest had selected, when there was one. */
  bookingDate?: string | null;
  /** "HH:MM[:SS]" wall-clock in the venue timezone, paired with `bookingDate`. */
  bookingTime?: string | null;
  /** True when the slot is less than 24 h away (computed in the venue timezone). */
  slotIsSoon: boolean;
  /** `hotels.client_cancellation_cutoff_hours` — omitted when the venue has no policy. */
  cancellationCutoffHours?: number | null;
  resumeUrl: string;
  /** Same flow, forced back to the schedule step. */
  rescheduleUrl: string;
  unsubscribeUrl: string;
}

interface ReminderCopy extends EmailCopy {
  sectionTitle: string;
  slotLabel: string;
  btnResume: string;
  onRequest: string;
  /** Scarcity line above the CTA — never a countdown, never a held slot. */
  hintNoSlot: string;
  hintSoon: (dateTime: string) => string;
  hintOpen: string;
  cancellation: (hours: number) => string;
  reschedule: string;
  unsubscribe: string;
  subject: (venue: string) => string;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

function reminderTemplate(copy: ReminderCopy): string {
  const button =
    `<tr><td class="eia-sect" style="padding:20px 40px 0">${primaryButton("{{{resume_url}}}", copy.btnResume)}</td></tr>`;
  const body =
    header(copy) +
    hero(copy) +
    "{{{slot_html}}}" +
    treatmentsSection(copy) +
    "{{{hint_html}}}" +
    button +
    "{{{cancellation_html}}}" +
    "{{{reschedule_html}}}" +
    footer(copy) +
    "{{{unsubscribe_html}}}";
  return shell(copy, body);
}

// ---------------------------------------------------------------------------
// Copy decks
// ---------------------------------------------------------------------------

const COPY_FR: ReminderCopy = {
  lang: "fr",
  preheader: "Votre sélection de soins vous attend encore.",
  pill: "Votre réservation vous attend",
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
  slotLabel: "Votre créneau",
  btnResume: "Reprendre ma réservation",
  onRequest: "Sur devis",
  hintNoSlot: "Il vous reste une étape : choisir votre créneau.",
  hintSoon: (dateTime: string) =>
    `Votre créneau du ${dateTime} est encore libre — les dernières places partent vite.`,
  hintOpen: "Ce créneau reste ouvert à la réservation tant qu'un autre client ne l'a pas retenu.",
  cancellation: (hours: number) => `Annulation gratuite jusqu'à ${hours} h avant votre soin.`,
  reschedule: "Choisir un autre créneau",
  unsubscribe: "Ne plus recevoir ces rappels",
  subject: (venue: string) => `Votre parenthèse chez ${venue} vous attend`,
  footerContactLabel: "Une question ? Répondez à ce mail, ou écrivez-nous à",
};

const COPY_EN: ReminderCopy = {
  lang: "en",
  preheader: "Your selection of treatments is still waiting.",
  pill: "Your booking is waiting",
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
  slotLabel: "Your slot",
  btnResume: "Resume my booking",
  onRequest: "On request",
  hintNoSlot: "One step left: pick your slot.",
  hintSoon: (dateTime: string) =>
    `Your ${dateTime} slot is still free — last-minute openings go quickly.`,
  hintOpen: "This slot stays open until another guest books it.",
  cancellation: (hours: number) => `Free cancellation up to ${hours} hrs before your treatment.`,
  reschedule: "Choose another time",
  unsubscribe: "Stop receiving these reminders",
  subject: (venue: string) => `Your escape at ${venue} is waiting`,
  footerContactLabel: "A question? Reply to this email, or write to us at",
};

const COPY: Record<Lang, ReminderCopy> = { fr: COPY_FR, en: COPY_EN };

export const CHECKOUT_INTENT_REMINDER_HTML_FR = reminderTemplate(COPY_FR);
export const CHECKOUT_INTENT_REMINDER_HTML_EN = reminderTemplate(COPY_EN);

// ---------------------------------------------------------------------------
// Fragments + vars
// ---------------------------------------------------------------------------

/** "15h00" in FR, "15:00" in EN — from a "HH:MM[:SS]" wall-clock string. */
function formatSlotTime(time: string, lang: Lang): string {
  const [hours, minutes] = time.split(":");
  return lang === "fr" ? `${hours}h${minutes}` : `${hours}:${minutes}`;
}

/** "samedi 11 juillet 2026 à 15h00" — the phrase reused by the hint line. */
function formatSlot(date: string, time: string, lang: Lang): string {
  const day = formatBookingDate(date, lang);
  const at = lang === "fr" ? "à" : "at";
  return `${day} ${at} ${formatSlotTime(time, lang)}`;
}

/** Framed card recalling the requested slot — '' when no slot was selected. */
function slotHtml(copy: ReminderCopy, date: string | null, time: string | null): string {
  if (!date || !time) return "";
  const row = keyRow(
    ICON_CALENDAR,
    copy.slotLabel,
    escapeHtml(formatBookingDate(date, copy.lang)),
    escapeHtml(formatSlotTime(time, copy.lang)),
    "",
  );
  return `<tr><td class="eia-sect" style="padding:28px 40px 0"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${SAND_100};border:1px solid ${LINE_SOFT};border-radius:14px"><tbody><tr><td class="eia-box" style="padding:22px 22px"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tbody>${row}</tbody></table></td></tr></tbody></table></td></tr>`;
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

/** Centered muted line, used for the scarcity hint and the cancellation policy. */
function mutedLine(text: string, paddingTop: number): string {
  return `<tr><td align="center" class="eia-sect" style="padding:${paddingTop}px 40px 0;text-align:center"><p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(text)}</p></td></tr>`;
}

/** Scarcity line above the CTA. Truthful in all three states — nothing is held. */
function hintHtml(copy: ReminderCopy, ctx: CheckoutIntentReminderContext): string {
  if (!ctx.bookingDate || !ctx.bookingTime) return mutedLine(copy.hintNoSlot, 24);
  const text = ctx.slotIsSoon
    ? copy.hintSoon(formatSlot(ctx.bookingDate, ctx.bookingTime, copy.lang))
    : copy.hintOpen;
  return mutedLine(text, 24);
}

/**
 * Reassurance under the CTA. Rendered only when the venue actually declares a
 * cutoff — promising free cancellation at a venue that charges for it would be
 * a worse problem than the missing line.
 */
function cancellationHtml(copy: ReminderCopy, hours: number | null | undefined): string {
  if (!hours || hours <= 0) return "";
  return mutedLine(copy.cancellation(hours), 14);
}

/** Discreet secondary link — recovers guests blocked by the slot, not the price. */
function rescheduleHtml(copy: ReminderCopy, hasSlot: boolean): string {
  if (!hasSlot) return "";
  return `<tr><td align="center" class="eia-sect" style="padding:14px 40px 0;text-align:center"><a href="{{{reschedule_url}}}" target="_blank" rel="noopener noreferrer nofollow" style="font-family:${FONT_SANS};font-size:12px;color:${INK_MUTE};text-decoration:underline">${copy.reschedule}</a></td></tr>`;
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
  const hasSlot = Boolean(ctx.bookingDate && ctx.bookingTime);

  return {
    logo_url: venueLogoUrl(ctx.venue),
    venue_name: escapeHtml(ctx.venueName),
    venue_address: escapeHtml(formatVenueAddress(ctx.venue)),
    contact_email: escapeHtml(ctx.venue?.contact_email),
    client_name: escapeHtml(ctx.firstName),
    section_title: copy.sectionTitle,
    slot_html: slotHtml(copy, ctx.bookingDate ?? null, ctx.bookingTime ?? null),
    treatments_html: itemsHtml(ctx.items, copy, sym),
    total_price: ctx.total == null ? copy.onRequest : `${ctx.total} ${sym}`,
    hint_html: hintHtml(copy, ctx),
    cancellation_html: cancellationHtml(copy, ctx.cancellationCutoffHours),
    reschedule_html: rescheduleHtml(copy, hasSlot),
    unsubscribe_html: unsubscribeHtml(copy),
    resume_url: ctx.resumeUrl,
    reschedule_url: ctx.rescheduleUrl,
    unsubscribe_url: ctx.unsubscribeUrl,
  };
}

export function getCheckoutIntentReminderHtml(ctx: CheckoutIntentReminderContext): string {
  const html = ctx.lang === "en"
    ? CHECKOUT_INTENT_REMINDER_HTML_EN
    : CHECKOUT_INTENT_REMINDER_HTML_FR;
  return renderTemplate(html, buildCheckoutIntentReminderVars(ctx));
}
