// "Booking cancelled" email — same sable / clay design as booking-confirmed.ts
// and booking-pending.ts, composed from the shared layout primitives in
// email-layout.ts. A rust status pill signals the cancelled state (vs the green
// "confirmed" / amber "pending" pills). The treatments section is replaced by a
// pre-rendered "cancellation / refund summary" card, followed by an optional
// reason note. Placeholders are filled by renderTemplate().
import { renderTemplate } from "./render.ts";
import {
  detailsBox,
  type EmailCopy,
  footer,
  header,
  hero,
  primaryButton,
  RUST,
  RUST_TINT,
  shell,
} from "./email-layout.ts";

interface CancelledCopy extends EmailCopy {
  btnRebook: string;
}

// ---------------------------------------------------------------------------
// Client template (FR / EN share structure; copy differs)
// ---------------------------------------------------------------------------

function clientTemplate(copy: CancelledCopy): string {
  const rebookButton =
    `<tr><td class="eia-sect" style="padding:28px 40px 0">${primaryButton("{{{rebook_url}}}", copy.btnRebook)}</td></tr>`;
  const body =
    header(copy) +
    hero(copy) +
    detailsBox(copy, "{{{extra_rows_html}}}") +
    "{{{payment_details_html}}}" +
    "{{{reason_html}}}" +
    rebookButton +
    footer(copy);
  return shell(copy, body);
}

// ---------------------------------------------------------------------------
// Admin template (FR only): no greeting, no rebook button.
// ---------------------------------------------------------------------------

function adminTemplate(copy: CancelledCopy): string {
  const body =
    header(copy) +
    hero(copy) +
    detailsBox(copy, "{{{extra_rows_html}}}") +
    "{{{payment_details_html}}}" +
    "{{{reason_html}}}" +
    footer(copy);
  return shell(copy, body);
}

// ---------------------------------------------------------------------------
// Copy decks
// ---------------------------------------------------------------------------

const CLIENT_COPY_FR: CancelledCopy = {
  lang: "fr",
  preheader: "Votre rendez-vous a été annulé.",
  pill: "Rendez-vous annulé",
  pillColor: RUST,
  pillTint: RUST_TINT,
  greetPrefix: "Bonjour",
  heading: "Votre rendez-vous a été <em style=\"font-style:italic;color:" + RUST + "\">annulé</em>.",
  showGreeting: true,
  intro: "Votre réservation a bien été annulée. Voici le récapitulatif ci-dessous.",
  labelWhen: "Quand",
  labelWhere: "Où",
  totalLabel: "Total",
  arriveNote: "",
  footerContactLabel: "Une question ?",
  btnRebook: "Réserver à nouveau",
};

const CLIENT_COPY_EN: CancelledCopy = {
  lang: "en",
  preheader: "Your appointment has been cancelled.",
  pill: "Appointment cancelled",
  pillColor: RUST,
  pillTint: RUST_TINT,
  greetPrefix: "Hello",
  heading: "Your appointment has been <em style=\"font-style:italic;color:" + RUST + "\">cancelled</em>.",
  showGreeting: true,
  intro: "Your booking has been cancelled. Here is the summary below.",
  labelWhen: "When",
  labelWhere: "Where",
  totalLabel: "Total",
  arriveNote: "",
  footerContactLabel: "A question?",
  btnRebook: "Book again",
};

const ADMIN_COPY_FR: CancelledCopy = {
  lang: "fr",
  preheader: "La réservation #{{{booking_number}}} a été annulée.",
  pill: "Réservation annulée",
  pillColor: RUST,
  pillTint: RUST_TINT,
  greetPrefix: "",
  heading: "Réservation #{{{booking_number}}} <em style=\"font-style:italic;color:" + RUST + "\">annulée</em>.",
  showGreeting: false,
  intro: "Voici le récapitulatif de l'annulation.",
  labelWhen: "Quand",
  labelWhere: "Où",
  totalLabel: "Total",
  arriveNote: "",
  footerContactLabel: "Une question ?",
  btnRebook: "",
};

const BOOKING_CANCELLED_HTML_FR = clientTemplate(CLIENT_COPY_FR);
const BOOKING_CANCELLED_HTML_EN = clientTemplate(CLIENT_COPY_EN);
const BOOKING_CANCELLED_ADMIN_HTML_FR = adminTemplate(ADMIN_COPY_FR);

export function getBookingCancelledHtml(lang: "fr" | "en", vars: Record<string, string>): string {
  return renderTemplate(lang === "en" ? BOOKING_CANCELLED_HTML_EN : BOOKING_CANCELLED_HTML_FR, vars);
}

export function getBookingCancelledAdminHtml(vars: Record<string, string>): string {
  return renderTemplate(BOOKING_CANCELLED_ADMIN_HTML_FR, vars);
}
