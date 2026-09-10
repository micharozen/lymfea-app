// "Booking modified" email — même design que la confirmation (sable / clay,
// Newsreader + DM Sans + IBM Plex Mono), à trois différences près :
//
//   1. la pastille et le titre annoncent une mise à jour, pas une confirmation ;
//   2. la ligne « Quand » montre le déplacement — ancien créneau barré,
//      nouveau en clay — au lieu de la seule valeur finale ;
//   3. pas de note d'arrivée : le client connaît déjà le déroulé, on ne
//      rallonge pas un message dont le seul sujet est ce qui a changé.
//
// La ligne « Quand » arrive pré-rendue (`when_row_html`) depuis
// booking-email-vars.ts, pour que le gabarit reste une composition pure.
import { renderTemplate } from "./render.ts";
import {
  AMBER,
  AMBER_TINT,
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

interface ModifiedCopy extends EmailCopy {
  btnMaps: string;
  btnManage: string;
  footerPoweredBy: string;
  footerUnsubscribe: string;
}

function clientTemplate(copy: ModifiedCopy): string {
  const buttons =
    `<tr><td class="eia-sect" style="padding:28px 40px 0">${primaryButton("{{{booking_url}}}", copy.btnManage)}</td></tr>` +
    `<tr><td class="eia-sect" style="padding:10px 40px 0">${ghostButton("{{{maps_url}}}", copy.btnMaps)}</td></tr>`;
  const body =
    header(copy) +
    hero(copy) +
    detailsBox(copy, "{{{therapist_row_html}}}", "{{{when_row_html}}}") +
    treatmentsSection(copy) +
    buttons +
    "{{{cancellation_html}}}" +
    footer(copy);
  return shell(copy, body);
}

// La pastille ambre est celle de l'attente, pas du succès : une réservation
// qui vient de bouger n'est pas un rendez-vous confirmé de plus.
const CLIENT_COPY_FR: ModifiedCopy = {
  lang: "fr",
  preheader: "{{{preheader}}}",
  pill: "{{{pill}}}",
  pillColor: AMBER,
  pillTint: AMBER_TINT,
  greetPrefix: "Bonjour",
  heading: "{{{heading}}}",
  showGreeting: true,
  intro: "{{{intro}}}",
  labelWhen: "Quand",
  labelWhere: "Où",
  totalLabel: "Total",
  btnMaps: "Itinéraire",
  btnManage: "Voir ma réservation",
  arriveNote: "",
  footerContactLabel: "Une question ?",
  footerPoweredBy: "propulsé par Eïa",
  footerUnsubscribe: "Se désabonner",
};

const CLIENT_COPY_EN: ModifiedCopy = {
  lang: "en",
  preheader: "{{{preheader}}}",
  pill: "{{{pill}}}",
  pillColor: AMBER,
  pillTint: AMBER_TINT,
  greetPrefix: "Hello",
  heading: "{{{heading}}}",
  showGreeting: true,
  intro: "{{{intro}}}",
  labelWhen: "When",
  labelWhere: "Where",
  totalLabel: "Total",
  btnMaps: "Directions",
  btnManage: "View my booking",
  arriveNote: "",
  footerContactLabel: "A question?",
  footerPoweredBy: "powered by Eïa",
  footerUnsubscribe: "Unsubscribe",
};

export const BOOKING_MODIFIED_HTML_FR = clientTemplate(CLIENT_COPY_FR);
export const BOOKING_MODIFIED_HTML_EN = clientTemplate(CLIENT_COPY_EN);

/** Accent du titre, aligné sur le <em> clay de la confirmation. */
export const MODIFIED_HEADING_ACCENT = CLAY;

export function getBookingModifiedHtml(lang: "fr" | "en", vars: Record<string, string>): string {
  return renderTemplate(lang === "en" ? BOOKING_MODIFIED_HTML_EN : BOOKING_MODIFIED_HTML_FR, vars);
}
