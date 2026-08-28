/**
 * Rendu HTML du rapport de clôture pour l'email.
 *
 * Jumeau de `renderClosureReportHtml` (src/lib/closureReport.ts, qui produit le
 * PDF) : même palette, même hiérarchie, même ordre de sections. La différence
 * tient au support — ici tout est en tables, seule mise en page fiable dans
 * Outlook et Gmail, là où le PDF peut utiliser flex.
 *
 * Ce rapport est adressé au lieu : il ne porte aucune marque de la plateforme
 * hormis la signature de bas de page.
 */

import { EMAIL_LOGO_URL } from "./brand.ts";

const INK = "#241E1B";
const INK_SOFT = "#6E635C";
const INK_FAINT = "#9A8F87";
const LINE = "#E7DFD7";
const LINE_SOFT = "#F0E9E2";
const ACCENT = "#C4714A";
const GROUND = "#FBF8F5";

const OK = "#3F6B4C";
const OK_SOFT = "#E8F1E9";
const INFO = "#3E5C7A";
const INFO_SOFT = "#E7EEF6";
const CRIT = "#9B4238";
const CRIT_SOFT = "#F8E7E4";
const NEUTRAL_SOFT = "#F0EBE5";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const STATUS_TONES: Record<string, { fg: string }> = {
  completed: { fg: OK },
  confirmed: { fg: INFO },
  pending: { fg: INFO },
  cancelled: { fg: CRIT },
  noshow: { fg: CRIT },
  no_show: { fg: CRIT },
  declined: { fg: CRIT },
  expired: { fg: INK_SOFT },
};

export interface ClosureEmailBreakdownRow {
  label: string;
  count: number;
  /** Part du total de la section, en pourcentage (0-100). */
  share: number;
  /** Montant déjà formaté dans la devise du lieu. */
  amount: string;
}

export interface ClosureEmailSection {
  title: string;
  labelHeader: string;
  rows: ClosureEmailBreakdownRow[];
  /** En-tête de la colonne de comptage. */
  countHeader?: string;
  /** Masque la colonne de part quand elle n'a pas de sens. */
  hideShare?: boolean;
}

export interface ClosureEmailDetailRow {
  bookingId: number;
  time: string;
  client: string;
  room: string;
  treatments: string;
  therapist: string;
  price: string;
  payment: string;
  status: string;
  statusLabel: string;
}

export interface ClosureEmailData {
  venueName: string;
  /** Organisation du lieu. Absente, rien ne la remplace. */
  issuer: string | null;
  dateLabel: string;
  /** Chiffre d'affaires déjà formaté. */
  totalRevenue: string;
  averageTicket: string;
  countedBookings: number;
  totalBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  completionPercent: string;
  includedUnfinalized: boolean;
  unfinalizedCount: number;
  unfinalizedRevenue: string;
  bookingsWithoutTherapistRate: number;
  hideCommissions: boolean;
  detail: ClosureEmailDetailRow[];
  sections: ClosureEmailSection[];
}

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plural(count: number, singular: string, pluralForm?: string): string {
  return count > 1 ? pluralForm ?? `${singular}s` : singular;
}

const cellBase =
  `padding:8px 10px;border-bottom:1px solid ${LINE_SOFT};font-size:12px;color:${INK};`;
const cellHeader =
  `padding:8px 10px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${INK_FAINT};border-bottom:1px solid ${LINE};`;
const sectionTitle = `margin:26px 0 10px;font-size:13px;font-weight:600;color:${INK};`;

function statusPill(status: string, label: string): string {
  const tone = STATUS_TONES[status] ?? { fg: INK_SOFT };
  // Statut en couleur, sans pastille, pour rester identique au PDF : là-bas le
  // moteur de capture décale la boîte de fond des éléments en ligne.
  return `<span style="color:${tone.fg};font-weight:500;white-space:nowrap;">${escapeHtml(label)}</span>`;
}

/** Statistique secondaire du bandeau : séparée par un filet, jamais encadrée. */
function bandStat(label: string, value: string, divider: boolean, tone?: string): string {
  return `
    <td style="padding:0 16px;vertical-align:bottom;${divider ? `border-left:1px solid ${LINE};` : "padding-left:0;"}">
      <p style="margin:0;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${INK_FAINT};white-space:nowrap;font-family:${FONT};">${escapeHtml(label)}</p>
      <p style="margin:6px 0 0;font-size:17px;font-weight:600;color:${tone ?? INK};font-family:${FONT};">${escapeHtml(value)}</p>
    </td>`;
}

function noticeRow(text: string, fg: string, bg: string, border: string): string {
  return `
    <tr><td style="padding:0 0 12px;">
      <p style="margin:0;padding:11px 14px;background:${bg};border:1px solid ${border};border-radius:10px;font-size:13px;color:${fg};font-family:${FONT};">${escapeHtml(text)}</p>
    </td></tr>`;
}

function breakdownTable(section: ClosureEmailSection): string {
  if (!section.rows.length) return "";
  const shareHeader = section.hideShare
    ? ""
    : `<th style="${cellHeader};text-align:right;">Part</th>`;
  const body = section.rows
    .map((r) => {
      const shareCell = section.hideShare
        ? ""
        : `<td style="${cellBase};text-align:right;color:${INK_SOFT};width:70px;">${escapeHtml(r.share.toFixed(0))} %</td>`;
      return `
        <tr>
          <td style="${cellBase}">${escapeHtml(r.label)}</td>
          <td style="${cellBase};text-align:right;width:90px;">${escapeHtml(String(r.count))}</td>
          ${shareCell}
          <td style="${cellBase};text-align:right;width:120px;">${escapeHtml(r.amount)}</td>
        </tr>`;
    })
    .join("");
  return `
    <h2 style="${sectionTitle};font-family:${FONT};">${escapeHtml(section.title)}</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
      <thead><tr>
        <th style="${cellHeader};text-align:left;">${escapeHtml(section.labelHeader)}</th>
        <th style="${cellHeader};text-align:right;">${escapeHtml(section.countHeader ?? "Prestations")}</th>
        ${shareHeader}
        <th style="${cellHeader};text-align:right;">CA</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function detailTable(rows: ClosureEmailDetailRow[]): string {
  if (!rows.length) return "";
  const body = rows
    .map(
      (r) => `
        <tr>
          <td style="${cellBase};color:${INK_SOFT};">${escapeHtml(r.time)}</td>
          <td style="${cellBase};color:${INK_SOFT};">#${escapeHtml(String(r.bookingId))}</td>
          <td style="${cellBase}">${escapeHtml(r.client)}</td>
          <td style="${cellBase}">${escapeHtml(r.room)}</td>
          <td style="${cellBase}">${escapeHtml(r.treatments)}</td>
          <td style="${cellBase}">${escapeHtml(r.therapist)}</td>
          <td style="${cellBase};text-align:right;">${escapeHtml(r.price)}</td>
          <td style="${cellBase}">${escapeHtml(r.payment)}</td>
          <td style="${cellBase}">${statusPill(r.status, r.statusLabel)}</td>
        </tr>`,
    )
    .join("");
  return `
    <h2 style="${sectionTitle};font-family:${FONT};">Détail des prestations</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr>
        <th style="${cellHeader};text-align:left;">Heure</th>
        <th style="${cellHeader};text-align:left;">N°</th>
        <th style="${cellHeader};text-align:left;">Client</th>
        <th style="${cellHeader};text-align:left;">Chambre</th>
        <th style="${cellHeader};text-align:left;">Prestation</th>
        <th style="${cellHeader};text-align:left;">Thérapeute</th>
        <th style="${cellHeader};text-align:right;">Prix</th>
        <th style="${cellHeader};text-align:left;">Paiement</th>
        <th style="${cellHeader};text-align:left;">Statut</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

export function renderClosureEmailHtml(data: ClosureEmailData): string {
  const notices = [
    data.includedUnfinalized && data.unfinalizedCount > 0
      ? noticeRow(
          `${data.unfinalizedCount} ${plural(data.unfinalizedCount, "réservation")} non encore ${plural(data.unfinalizedCount, "finalisée")} (${data.unfinalizedRevenue}) ${data.unfinalizedCount > 1 ? "sont comptées" : "est comptée"} dans ce rapport.`,
          INFO,
          INFO_SOFT,
          "#C9D8E6",
        )
      : "",
    !data.hideCommissions && data.bookingsWithoutTherapistRate > 0
      ? noticeRow(
          `${data.bookingsWithoutTherapistRate} ${plural(data.bookingsWithoutTherapistRate, "prestation")} sans tarif thérapeute défini, part thérapeute calculée à 0 sur ces lignes.`,
          "#8A6216",
          "#F9F0DC",
          "#E4CB92",
        )
      : "",
  ].join("");

  const issuerLine = data.issuer
    ? `<p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${INK_SOFT};font-family:${FONT};">${escapeHtml(data.issuer)} · Clôture quotidienne</p>`
    : `<p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${INK_SOFT};font-family:${FONT};">Clôture quotidienne</p>`;

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${GROUND};font-family:${FONT};color:${INK};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${GROUND};padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:780px;background:#ffffff;border-radius:14px;border:1px solid ${LINE};">
        <tr><td style="padding:28px 30px 0;">

          <div style="border-bottom:2px solid ${ACCENT};padding-bottom:14px;">
            ${issuerLine}
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:600;font-family:${FONT};">${escapeHtml(data.venueName)}</h1>
            <p style="margin:4px 0 0;font-size:14px;color:${INK_SOFT};font-family:${FONT};">${escapeHtml(data.dateLabel)}</p>
          </div>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">${notices}</table>

          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;margin:6px 0 4px;">
            <tr><td style="padding:20px 22px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:bottom;">
                    <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${INK_SOFT};font-family:${FONT};">
                      ${data.includedUnfinalized ? "Chiffre d'affaires projeté" : "Chiffre d'affaires réalisé"}
                    </p>
                    <p style="margin:6px 0 0;font-size:32px;font-weight:600;line-height:1;font-family:${FONT};">${escapeHtml(data.totalRevenue)}</p>
                    <p style="margin:8px 0 0;font-size:13px;color:${INK_SOFT};font-family:${FONT};">
                      ${data.countedBookings} ${plural(data.countedBookings, "prestation")} ${plural(data.countedBookings, "comptée")} sur ${data.totalBookings} ${plural(data.totalBookings, "réservation")}, soit ${escapeHtml(data.completionPercent)} ${data.includedUnfinalized ? "réalisé ou à venir" : "réalisé à date"}
                    </p>
                  </td>
                  <td align="right" style="vertical-align:bottom;">
                    <table cellpadding="0" cellspacing="0"><tr>
                      ${bandStat("Panier moyen", data.averageTicket, false)}
                      ${bandStat("Nombre total de réservations", String(data.totalBookings), true)}
                      ${bandStat("Annulées", String(data.cancelledBookings), true, data.cancelledBookings > 0 ? CRIT : undefined)}
                      ${bandStat("No show", String(data.noShowBookings), true, data.noShowBookings > 0 ? CRIT : undefined)}
                    </tr></table>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          ${detailTable(data.detail)}
          ${data.sections.map(breakdownTable).join("")}

        </td></tr>

        <tr><td style="padding:28px 30px 26px;text-align:center;">
          <p style="margin:0;font-size:11px;color:${INK_FAINT};font-family:${FONT};">
            <img src="${EMAIL_LOGO_URL}" width="14" height="14" alt="" style="vertical-align:-2px;border:0;">
            <span style="margin-left:6px;">by Saoma</span>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
