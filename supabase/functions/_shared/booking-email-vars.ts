// Single source of truth for the variables sent to Resend booking-email
// templates. Each edge function fetches its own data (recipients, side effects
// and persistence stay in the function), builds a normalized context, then
// calls the builder for the relevant template family. Adding a variable to
// every booking email — like `logo_url` — is done here, once.
//
// Canonical contract (normalized across all families):
//   - booking_date : full localized date WITH year ("lundi 15 mai 2025")
//   - booking_time : "HH:MM", always provided separately from booking_date
//   - treatment_duration : "{sum} min"
//   - total_price / treatment_price : amount + venue currency symbol
//   - logo_url : venue logo (falls back to the brand logo)

import { EMAIL_LOGO_URL } from "./brand.ts";
import { civilityLabel } from "./civility.ts";
import {
  ICON_PERSON,
  ICON_ROOM,
  keyGap,
  keyRow,
} from "./templates/booking-confirmed.ts";

export type Lang = 'fr' | 'en';

/** Subset of a `hotels` row consumed by the email builders. */
export interface EmailVenue {
  image?: string | null;
  currency?: string | null;
  contact_email?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  website_url?: string | null;
  cancellation_policy_text_en?: string | null;
  cancellation_policy_text_fr?: string | null;
  organizations?: { name?: string | null } | null;
}

export interface EmailTreatment {
  name: string;
  price: number;
  duration?: number;
}

// ---------------------------------------------------------------------------
// Unit helpers (reusable on their own by callers)
// ---------------------------------------------------------------------------

/** Venue logo for emails: the venue's own image, else the brand logo. */
export function venueLogoUrl(venue?: EmailVenue | null): string {
  const img = venue?.image?.trim();
  // Only trust absolute https URLs. Local-dev uploads (http://127.0.0.1…) or
  // relative paths render as a broken image in email clients → use brand logo.
  return img && /^https:\/\//i.test(img) ? img : EMAIL_LOGO_URL;
}

/** Escape a string for safe interpolation into email HTML. */
export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Currency symbol from an ISO code ('eur' → '€', otherwise the upper-cased code). */
export function currencySymbol(code?: string | null): string {
  const c = (code || 'eur').toLowerCase();
  return c === 'eur' ? '€' : c.toUpperCase();
}

/** Canonical booking date for emails: full, localized, with year. */
export function formatBookingDate(dateStr: string, lang: Lang): string {
  return new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Canonical booking time for emails: "HH:MM". */
export function formatBookingTime(timeStr?: string | null): string {
  return timeStr?.substring(0, 5) || '';
}

/** Comma-joined venue address from its parts. */
export function formatVenueAddress(venue?: EmailVenue | null): string {
  return [venue?.address, venue?.postal_code, venue?.city, venue?.country]
    .filter(Boolean)
    .join(', ');
}

/** Google Maps directions URL for the venue address ('' when no address). */
export function venueMapsUrl(venue?: EmailVenue | null): string {
  const address = formatVenueAddress(venue);
  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : '';
}

/** Human total duration ("1 h", "1 h 30", "45 min"); '' when unknown/zero. */
export function formatTotalDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m}`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/** Aggregate a booking's treatments into a single name / price / duration. */
export function aggregateTreatments(treatments: EmailTreatment[]): {
  name: string;
  price: number;
  duration: number;
} {
  return {
    name: treatments.map(t => t.name).filter(Boolean).join(', '),
    price: treatments.reduce((sum, t) => sum + (Number(t.price) || 0), 0),
    duration: treatments.reduce((sum, t) => sum + (Number(t.duration) || 0), 0),
  };
}

/**
 * Localized greeting for a client. When a civility is set we prefix the last
 * name ("Madame Dupont"); otherwise we fall back to first + last name.
 * `greetingName` is the short form used in SMS / intro text (civility + last
 * name, else the first name alone).
 */
export function clientGreeting(
  civility: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  lang: Lang,
): { civility: string; clientName: string; greetingName: string } {
  const label = civilityLabel(civility, lang);
  const first = firstName ?? '';
  const last = lastName ?? '';
  return {
    civility: label ?? '',
    clientName: label ? `${label} ${last}`.trim() : `${first} ${last}`.trim(),
    greetingName: label ? `${label} ${last}`.trim() : first,
  };
}

// ---------------------------------------------------------------------------
// Normalized context + template-variable builders
// ---------------------------------------------------------------------------

export interface BookingEmailContext {
  booking: {
    booking_id?: number | string | null;
    client_first_name?: string | null;
    client_last_name?: string | null;
    phone?: string | null;
    room_number?: number | string | null;
    therapist_name?: string | null;
    total_price?: number | null;
    hotel_name?: string | null;
    booking_date: string;
    booking_time?: string | null;
  };
  venue?: EmailVenue | null;
  civility?: string | null;
  lang: Lang;
  treatments: EmailTreatment[];
  /** Client-facing "manage booking" URL or admin detail URL (confirmed family). */
  bookingUrl?: string;
  /** "Add to calendar" URL (booking-ics edge function) for the confirmed family. */
  calendarUrl?: string;
  /** Overrides booking.phone when the customer record holds a better number. */
  clientPhone?: string | null;
  /** Overrides organization_name (e.g. brand-name fallback). */
  organizationName?: string | null;
  /** Overrides contact_email (e.g. brand contact-email fallback). */
  contactEmail?: string | null;
  /** Which "confirmed" template consumes these vars (drives copy nuances). */
  variant?: 'client' | 'admin';
}

function greetingFor(ctx: BookingEmailContext) {
  return clientGreeting(
    ctx.civility,
    ctx.booking.client_first_name,
    ctx.booking.client_last_name,
    ctx.lang,
  );
}

// ---------------------------------------------------------------------------
// HTML fragment builders (pre-rendered blocks; renderTemplate injects them raw)
// ---------------------------------------------------------------------------
// The renderer substitutes empty strings for missing keys, so a conditional
// section is modeled as a variable holding either its rendered HTML or ''. This
// keeps all optionality in TS (typed, testable) rather than in the HTML blob.

const FRAG_LABELS = {
  fr: { min: 'min', therapist: 'Praticien', room: 'Chambre', modify: 'Modifier ou annuler', policy: "Politique d'annulation" },
  en: { min: 'min', therapist: 'Therapist', room: 'Room', modify: 'Modify or cancel', policy: 'Cancellation policy' },
} as const;

// Palette echoed from templates/booking-confirmed.ts (kept in sync).
const FONT_SERIF = "'Newsreader',Georgia,'Times New Roman',serif";
const FONT_SANS = "'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
const INK = '#2A2419';
const INK_SOFT = '#6B5E4B';
const INK_MUTE = '#8F8472';
const CLAY = '#B05A35';
const LINE_SOFT = 'rgba(42,36,25,0.07)';

/** One `tline` per treatment: name + duration subline left, serif price right. */
function treatmentsHtml(treatments: EmailTreatment[], sym: string, lang: Lang): string {
  const min = FRAG_LABELS[lang].min;
  return treatments
    .map((t) => {
      const sub = Number(t.duration) > 0
        ? `<span style="display:block;margin-top:2px;font-family:${FONT_SANS};font-size:12px;color:${INK_MUTE}">${Number(t.duration)} ${min}</span>`
        : '';
      const price = `${Number(t.price) || 0} ${sym}`;
      return `<tr><td style="padding:12px 0;border-bottom:1px solid ${LINE_SOFT};font-family:${FONT_SANS};font-size:15px;color:${INK}">${escapeHtml(t.name)}${sub}</td><td align="right" style="padding:12px 0;border-bottom:1px solid ${LINE_SOFT};font-family:${FONT_SERIF};font-size:16px;color:${INK};white-space:nowrap;vertical-align:top">${escapeHtml(price)}</td></tr>`;
    })
    .join('');
}

/**
 * A full key-info row (icon tile + label / value / subline), prefixed by a
 * spacer so it stacks under the "Where" row inside the framed box; '' when the
 * value is empty so the row collapses.
 */
function keyRowFragment(svg: string, label: string, value: string, sub: string): string {
  if (!value) return '';
  return keyGap() + keyRow(svg, escapeHtml(label), escapeHtml(value), escapeHtml(sub), '');
}

/** Footer website line (linked); '' when the venue has no website. */
function footerWebsiteHtml(url: string | null | undefined): string {
  const raw = url?.trim();
  if (!raw) return '';
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const label = raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return `<p style="margin:8px 0 0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${INK_MUTE}"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow" style="color:${CLAY};text-decoration:underline">${escapeHtml(label)}</a></p>`;
}

/** Cancellation-policy line + "modify/cancel" link; '' when no policy text. */
function cancellationHtml(policy: string, bookingUrl: string, lang: Lang): string {
  if (!policy) return '';
  const l = FRAG_LABELS[lang];
  const link = bookingUrl
    ? ` <a href="${escapeHtml(bookingUrl)}" style="color:${CLAY};text-decoration:underline;font-family:${FONT_SANS};font-size:12px">${escapeHtml(l.modify)}</a>`
    : '';
  return `<tr><td align="center" style="padding:20px 48px 0"><p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${INK_MUTE}"><strong style="font-weight:500;color:${INK_SOFT}">${escapeHtml(l.policy)} :</strong> ${escapeHtml(policy)}${link}</p></td></tr>`;
}

/** Variables for the "booking confirmed" template family. */
export function buildConfirmedVars(ctx: BookingEmailContext): Record<string, string> {
  const { clientName, civility } = greetingFor(ctx);
  const agg = aggregateTreatments(ctx.treatments);
  const sym = currencySymbol(ctx.venue?.currency);
  const bookingUrl = ctx.bookingUrl ?? '';
  const policy = venueCancellationPolicy(ctx.venue, ctx.lang);
  const roomNumber = ctx.booking.room_number ? String(ctx.booking.room_number) : '';
  const therapistName = ctx.booking.therapist_name ?? '';
  const totalDuration = formatTotalDuration(agg.duration);
  const isAdmin = ctx.variant === 'admin';
  const count = ctx.treatments.length;
  const sectionTitle = isAdmin
    ? (count > 1 ? 'Prestations' : 'Prestation')
    : ctx.lang === 'en'
      ? (count > 1 ? 'Your treatments' : 'Your treatment')
      : (count > 1 ? 'Vos soins' : 'Votre soin');
  // Hotel guest (has a room) vs external client — admin block only.
  const isHotelClient = !!roomNumber;
  const clientTypeLabel = isHotelClient
    ? (ctx.lang === 'en' ? 'Hotel guest' : 'Client hôtel')
    : (ctx.lang === 'en' ? 'External client' : 'Client externe');
  const clientTypeRow = isAdmin
    ? keyGap() + keyRow(
        isHotelClient ? ICON_ROOM : ICON_PERSON,
        ctx.lang === 'en' ? 'Type' : 'Type',
        clientTypeLabel,
        '',
        '',
      )
    : '';
  return {
    booking_number: String(ctx.booking.booking_id ?? ''),
    booking_date: formatBookingDate(ctx.booking.booking_date, ctx.lang),
    booking_time: formatBookingTime(ctx.booking.booking_time),
    booking_url: bookingUrl,
    client_civility: civility,
    client_name: clientName,
    client_phone: ctx.clientPhone ?? ctx.booking.phone ?? '',
    hotel_name: ctx.booking.hotel_name ?? '',
    venue_name: ctx.booking.hotel_name ?? '',
    room_number: roomNumber,
    therapist_name: therapistName,
    total_price: `${ctx.booking.total_price ?? 0} ${sym}`,
    section_title: sectionTitle,
    client_type_row_html: clientTypeRow,
    total_duration: totalDuration,
    total_duration_sep: totalDuration ? ` · ${totalDuration}` : '',
    treatment_name: agg.name,
    treatment_price: `${agg.price} ${sym}`,
    treatment_duration: `${agg.duration} min`,
    contact_email: ctx.contactEmail ?? ctx.venue?.contact_email ?? '',
    venue_address: formatVenueAddress(ctx.venue),
    venue_city: ctx.venue?.city ?? '',
    footer_website_html: footerWebsiteHtml(ctx.venue?.website_url),
    organization_name: ctx.organizationName ?? ctx.venue?.organizations?.name ?? '',
    cancel_annulation: policy,
    logo_url: venueLogoUrl(ctx.venue),
    // Pre-rendered HTML fragments consumed by the new email template.
    treatments_html: treatmentsHtml(ctx.treatments, sym, ctx.lang),
    cancellation_html: cancellationHtml(policy, bookingUrl, ctx.lang),
    therapist_row_html: keyRowFragment(
      ICON_PERSON,
      FRAG_LABELS[ctx.lang].therapist,
      therapistName,
      '',
    ),
    room_row_html: keyRowFragment(ICON_ROOM, FRAG_LABELS[ctx.lang].room, roomNumber, ''),
    maps_url: venueMapsUrl(ctx.venue),
    calendar_url: ctx.calendarUrl ?? '',
  };
}

/** Venue cancellation-policy text for the given language (empty when unset). */
export function venueCancellationPolicy(venue: EmailVenue | null | undefined, lang: Lang): string {
  return (lang === 'en'
    ? venue?.cancellation_policy_text_en
    : venue?.cancellation_policy_text_fr) ?? '';
}

/** Variables for the "pending booking request" template family. Shares the
 * confirmed template's sable/clay layout, so it supplies the same keys — minus
 * the therapist row, which stays empty while no therapist is assigned. */
export function buildPendingVars(ctx: BookingEmailContext): Record<string, string> {
  const { clientName, civility } = greetingFor(ctx);
  const agg = aggregateTreatments(ctx.treatments);
  const sym = currencySymbol(ctx.venue?.currency);
  const totalDuration = formatTotalDuration(agg.duration);
  const count = ctx.treatments.length;
  const sectionTitle = ctx.lang === 'en'
    ? (count > 1 ? 'Your treatments' : 'Your treatment')
    : (count > 1 ? 'Vos soins' : 'Votre soin');
  return {
    booking_number: String(ctx.booking.booking_id ?? ''),
    booking_date: formatBookingDate(ctx.booking.booking_date, ctx.lang),
    booking_time: formatBookingTime(ctx.booking.booking_time),
    booking_url: ctx.bookingUrl ?? '',
    client_civility: civility,
    client_name: clientName,
    first_name: ctx.booking.client_first_name ?? '',
    hotel_name: ctx.booking.hotel_name ?? '',
    venue_name: ctx.booking.hotel_name ?? '',
    room_number: ctx.booking.room_number ? String(ctx.booking.room_number) : '',
    total_price: `${ctx.booking.total_price ?? 0} ${sym}`,
    section_title: sectionTitle,
    total_duration: totalDuration,
    total_duration_sep: totalDuration ? ` · ${totalDuration}` : '',
    treatment_name: agg.name,
    contact_email: ctx.contactEmail ?? ctx.venue?.contact_email ?? '',
    venue_address: formatVenueAddress(ctx.venue),
    organization_name: ctx.organizationName ?? ctx.venue?.organizations?.name ?? '',
    logo_url: venueLogoUrl(ctx.venue),
    // Pre-rendered HTML fragments consumed by the shared layout. Therapist row
    // stays empty (unassigned while pending) so the row collapses.
    treatments_html: treatmentsHtml(ctx.treatments, sym, ctx.lang),
    therapist_row_html: '',
    footer_website_html: footerWebsiteHtml(ctx.venue?.website_url),
    maps_url: venueMapsUrl(ctx.venue),
  };
}

/** Payment-specific values that vary per call site. */
export interface PaymentLinkExtras {
  paymentUrl: string;
  expiryDate: string;
  introText: string;
  /** Amount to collect; defaults to booking.total_price then treatments sum. */
  totalAmount?: number;
}

/** Variables for the "payment link required" template family. */
export function buildPaymentLinkVars(
  ctx: BookingEmailContext,
  extras: PaymentLinkExtras,
): Record<string, string> {
  const { civility } = greetingFor(ctx);
  const agg = aggregateTreatments(ctx.treatments);
  const sym = currencySymbol(ctx.venue?.currency);
  const total = extras.totalAmount ?? ctx.booking.total_price ?? agg.price;
  return {
    booking_number: String(ctx.booking.booking_id ?? ''),
    booking_date: formatBookingDate(ctx.booking.booking_date, ctx.lang),
    booking_time: formatBookingTime(ctx.booking.booking_time),
    client_civility: civility,
    venue_name: ctx.booking.hotel_name ?? '',
    treatment_name: agg.name,
    treatment_price: `${total}${sym}`,
    treatment_duration: `${agg.duration} min`,
    total_price: `${total}${sym}`,
    payment_url: extras.paymentUrl,
    expiry_date: extras.expiryDate,
    intro_text: extras.introText,
    logo_url: venueLogoUrl(ctx.venue),
  };
}
