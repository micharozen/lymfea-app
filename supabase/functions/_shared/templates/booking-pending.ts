// "Booking request received" (pending) email — same sable / clay design as
// booking-confirmed.ts, composed from the shared layout primitives in
// email-layout.ts. Amber status pill signals the "awaiting therapist
// confirmation" state (vs the green "confirmed" pill). No therapist row yet
// (none assigned at the pending stage) and no "add to calendar" button (the
// appointment is not confirmed). Placeholders are filled by renderTemplate().
import { renderTemplate } from "./render.ts";
import {
  AMBER,
  AMBER_TINT,
  arrivalNote,
  CLAY,
  detailsBox,
  type EmailCopy,
  footer,
  ghostButton,
  header,
  hero,
  primaryButton,
  shell,
  treatmentsSection,
} from "./email-layout.ts";

export const BOOKING_PENDING_SUBJECT: Record<"fr" | "en", string> = {
  fr: "Votre demande de rendez-vous est bien enregistrée.",
  en: "Your therapist will confirm your appointment shortly.",
};

interface PendingCopy extends EmailCopy {
  sectionTitle: string;
  btnMaps: string;
  btnManage: string;
}

function clientTemplate(copy: PendingCopy): string {
  const buttons =
    `<tr><td style="padding:28px 48px 0">${primaryButton("{{{booking_url}}}", copy.btnManage)}</td></tr>` +
    `<tr><td style="padding:10px 48px 0">${ghostButton("{{{maps_url}}}", copy.btnMaps)}</td></tr>`;
  const body =
    header(copy) +
    hero(copy) +
    // Therapist row is intentionally empty: none is assigned while pending.
    detailsBox(copy, "") +
    treatmentsSection(copy) +
    buttons +
    arrivalNote(copy) +
    footer(copy);
  return shell(copy, body);
}

// ---------------------------------------------------------------------------
// Copy decks
// ---------------------------------------------------------------------------

const CLIENT_COPY_FR: PendingCopy = {
  lang: "fr",
  preheader: "Votre demande est bien enregistrée, un praticien va la confirmer.",
  pill: "Demande reçue",
  pillColor: AMBER,
  pillTint: AMBER_TINT,
  greetPrefix: "Bonjour",
  heading: "Votre demande est bien <em style=\"font-style:italic;color:" + CLAY + "\">enregistrée</em>.",
  showGreeting: true,
  intro: "Un praticien va confirmer votre rendez-vous très prochainement. Voici le récapitulatif de votre demande.",
  labelWhen: "Quand",
  labelWhere: "Où",
  sectionTitle: "Votre soin",
  totalLabel: "Total",
  btnMaps: "Itinéraire",
  btnManage: "Gérer ma demande",
  arriveNote: "Vous recevrez un e-mail de confirmation dès qu'un praticien aura pris en charge votre rendez-vous.",
  footerContactLabel: "Une question ?",
};

const CLIENT_COPY_EN: PendingCopy = {
  lang: "en",
  preheader: "Your request is registered — a therapist will confirm it shortly.",
  pill: "Request received",
  pillColor: AMBER,
  pillTint: AMBER_TINT,
  greetPrefix: "Hello",
  heading: "Your request has been <em style=\"font-style:italic;color:" + CLAY + "\">received</em>.",
  showGreeting: true,
  intro: "A therapist will confirm your appointment shortly. Here is the summary of your request.",
  labelWhen: "When",
  labelWhere: "Where",
  sectionTitle: "Your treatment",
  totalLabel: "Total",
  btnMaps: "Directions",
  btnManage: "Manage request",
  arriveNote: "You will receive a confirmation email as soon as a therapist takes your appointment.",
  footerContactLabel: "A question?",
};

export const BOOKING_PENDING_HTML_FR = clientTemplate(CLIENT_COPY_FR);
export const BOOKING_PENDING_HTML_EN = clientTemplate(CLIENT_COPY_EN);

export function getBookingPendingHtml(lang: "fr" | "en", vars: Record<string, string>): string {
  return renderTemplate(lang === "en" ? BOOKING_PENDING_HTML_EN : BOOKING_PENDING_HTML_FR, vars);
}
