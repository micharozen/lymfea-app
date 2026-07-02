// "Booking confirmed" email — sable / clay design (Newsreader + DM Sans + IBM
// Plex Mono). Composed from the shared layout primitives in email-layout.ts
// (framed "key info" card with inline PNG icons, rounded cards, status pill,
// split button row and an arrival note). Kept email-safe where it matters
// (presentation tables, inline styles, 600px card).
//
// Optional / repeated sections are injected as pre-rendered HTML fragments
// produced by booking-email-vars.ts (treatments_html, cancellation_html,
// therapist_row_html, room_row_html) — an empty fragment collapses the section.
// Placeholders are filled by renderTemplate().
import { renderTemplate } from "./render.ts";
import {
  arrivalNote,
  CLAY,
  detailsBox,
  type EmailCopy,
  FONT_MONO,
  footer,
  ghostButton,
  header,
  hero,
  ICON_PERSON,
  ICON_PHONE,
  INK_MUTE,
  keyGap,
  keyRow,
  LINE_SOFT,
  MOSS,
  MOSS_TINT,
  primaryButton,
  SAND_100,
  shell,
  treatmentsSection,
} from "./email-layout.ts";

// Re-exported so booking-email-vars.ts can build key-info fragments against the
// same primitives without depending on email-layout.ts directly.
export { ICON_PERSON, ICON_ROOM, keyGap, keyRow } from "./email-layout.ts";

interface ConfirmedCopy extends EmailCopy {
  labelRef: string;
  sectionTitle: string;
  btnMaps: string;
  btnManage: string;
  clientBlockTitle: string;
  labelPhone: string;
  footerPoweredBy: string;
  footerUnsubscribe: string;
}

// ---------------------------------------------------------------------------
// Client template (FR / EN share structure; copy differs)
// ---------------------------------------------------------------------------

function clientTemplate(copy: ConfirmedCopy): string {
  const buttons =
    `<tr><td style="padding:28px 48px 0">${primaryButton("{{{booking_url}}}", copy.btnManage)}</td></tr>` +
    `<tr><td style="padding:10px 48px 0">${ghostButton("{{{maps_url}}}", copy.btnMaps)}</td></tr>`;
  const body =
    header(copy) +
    hero(copy) +
    detailsBox(copy, "{{{therapist_row_html}}}") +
    treatmentsSection(copy) +
    buttons +
    arrivalNote(copy) +
    "{{{cancellation_html}}}" +
    footer(copy);
  return shell(copy, body);
}

// ---------------------------------------------------------------------------
// Admin / concierge template (FR only): no greeting, client info block, no
// calendar button, no arrival note / policy.
// ---------------------------------------------------------------------------

function adminTemplate(copy: ConfirmedCopy): string {
  const clientBlock =
    `<tr><td style="padding:28px 48px 0"><p style="margin:0 0 10px;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${INK_MUTE}">${copy.clientBlockTitle}</p><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${SAND_100};border:1px solid ${LINE_SOFT};border-radius:14px"><tbody><tr><td style="padding:22px 22px"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tbody>` +
    keyRow(ICON_PERSON, "Client", "{{{client_name}}}", "", "") +
    `{{{client_type_row_html}}}` +
    keyGap() +
    keyRow(ICON_PHONE, copy.labelPhone, "{{{client_phone}}}", "", "") +
    `{{{room_row_html}}}` +
    `</tbody></table></td></tr></tbody></table></td></tr>`;
  const buttons =
    `<tr><td style="padding:28px 48px 40px">${primaryButton("{{{booking_url}}}", copy.btnManage)}</td></tr>`;
  const body =
    header(copy) +
    hero(copy) +
    detailsBox(copy, "{{{therapist_row_html}}}") +
    clientBlock +
    treatmentsSection(copy) +
    buttons;
  return shell(copy, body);
}

// ---------------------------------------------------------------------------
// Copy decks + composed constants
// ---------------------------------------------------------------------------

const CLIENT_COPY_FR: ConfirmedCopy = {
  lang: "fr",
  preheader: "Votre soin est confirmé et un praticien vous attend.",
  pill: "Soin confirmé",
  pillColor: MOSS,
  pillTint: MOSS_TINT,
  greetPrefix: "Bonjour",
  heading: "Votre soin vient d'être <em style=\"font-style:italic;color:" + CLAY + "\">confirmé</em>.",
  showGreeting: true,
  intro: "Un praticien a pris en charge votre réservation. Voici le récapitulatif de votre soin.",
  labelWhen: "Quand",
  labelWhere: "Où",
  labelRef: "Référence",
  sectionTitle: "Votre soin",
  totalLabel: "Total",
  btnMaps: "Itinéraire",
  btnManage: "Gérer ma réservation",
  arriveNote: "Merci d'arriver 10 minutes avant le début de votre soin afin de profiter pleinement de votre moment.",
  clientBlockTitle: "",
  labelPhone: "Téléphone",
  footerContactLabel: "Une question ?",
  footerPoweredBy: "propulsé par Eïa",
  footerUnsubscribe: "Se désabonner",
};

const CLIENT_COPY_EN: ConfirmedCopy = {
  lang: "en",
  preheader: "Your treatment is confirmed and a therapist is expecting you.",
  pill: "Treatment confirmed",
  pillColor: MOSS,
  pillTint: MOSS_TINT,
  greetPrefix: "Hello",
  heading: "Your treatment is now <em style=\"font-style:italic;color:" + CLAY + "\">confirmed</em>.",
  showGreeting: true,
  intro: "A therapist has taken your booking. Here is the summary of your treatment.",
  labelWhen: "When",
  labelWhere: "Where",
  labelRef: "Reference",
  sectionTitle: "Your treatment",
  totalLabel: "Total",
  btnMaps: "Directions",
  btnManage: "Manage booking",
  arriveNote: "Please arrive 10 minutes before your treatment begins to fully enjoy your moment.",
  clientBlockTitle: "",
  labelPhone: "Phone",
  footerContactLabel: "A question?",
  footerPoweredBy: "powered by Eïa",
  footerUnsubscribe: "Unsubscribe",
};

const ADMIN_COPY_FR: ConfirmedCopy = {
  lang: "fr",
  preheader: "La réservation #{{{booking_number}}} est confirmée.",
  pill: "Réservation confirmée",
  pillColor: MOSS,
  pillTint: MOSS_TINT,
  greetPrefix: "",
  heading: "Réservation #{{{booking_number}}} <em style=\"font-style:italic;color:" + CLAY + "\">confirmée</em>.",
  showGreeting: false,
  intro: "Voici le récapitulatif de la réservation.",
  labelWhen: "Quand",
  labelWhere: "Où",
  labelRef: "Référence",
  sectionTitle: "Prestation",
  totalLabel: "Total",
  btnMaps: "Itinéraire",
  btnManage: "Voir la réservation",
  arriveNote: "",
  clientBlockTitle: "Client",
  labelPhone: "Téléphone",
  footerContactLabel: "Une question ?",
  footerPoweredBy: "propulsé par Eïa",
  footerUnsubscribe: "Se désabonner",
};

export const BOOKING_CONFIRMED_HTML_FR = clientTemplate(CLIENT_COPY_FR);
export const BOOKING_CONFIRMED_HTML_EN = clientTemplate(CLIENT_COPY_EN);
export const BOOKING_CONFIRMED_ADMIN_HTML_FR = adminTemplate(ADMIN_COPY_FR);

export function getBookingConfirmedHtml(lang: "fr" | "en", vars: Record<string, string>): string {
  return renderTemplate(lang === "en" ? BOOKING_CONFIRMED_HTML_EN : BOOKING_CONFIRMED_HTML_FR, vars);
}

export function getBookingConfirmedAdminHtml(vars: Record<string, string>): string {
  return renderTemplate(BOOKING_CONFIRMED_ADMIN_HTML_FR, vars);
}
