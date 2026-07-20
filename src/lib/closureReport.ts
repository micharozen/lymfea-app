// Daily closure report — pure data + HTML rendering.
// Shared by the on-screen preview, the PDF export, and the recipient email body.

import { brand } from "@/config/brand";
import { computeTherapistEarnings, type TherapistRates } from "@/lib/therapistEarnings";
import { isBookingClientType, type BookingClientType } from "@/lib/clientTypeMeta";

export interface ClosureBookingTreatment {
  name: string;
  category: string | null;
  duration: number | null;
}

export interface ClosureBooking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  client_type: ClientTypeValue;
  room_number: string | null;
  therapist_id: string | null;
  therapist_name: string | null;
  duration: number | null;
  total_price: number | null;
  is_out_of_hours?: boolean | null;
  payment_method: string | null;
  payment_status: string | null;
  status: string;
  treatments: ClosureBookingTreatment[];
}

export interface ClosureVenue {
  id: string;
  name: string;
  currency: string;
  hotel_commission: number;
  venue_type: string | null;
  out_of_hours_surcharge_percent?: number | null;
}

// Libellés spécifiques au rapport de clôture (formulation « rapport »),
// distincts des labels i18n de l'UI. closureReport en est le seul consommateur.
export type ClientTypeValue = BookingClientType;

export const CLIENT_TYPE_LABELS: Record<ClientTypeValue, string> = {
  hotel: "Résident hôtel",
  staycation: "Staycation",
  classpass: "Classpass",
  sezame: "Sezame",
  external: "Client externe",
};

export type TherapistRatesMap = Record<string, TherapistRates | null>;

export interface ClosureBucket {
  key: string;
  label: string;
  count: number;
  revenue: number;
}

export interface ClosureTherapistBucket extends ClosureBucket {
  earnings: number;
  hasRates: boolean;
}

export interface ClosureClientTypeBucket {
  key: ClientTypeValue;
  label: string;
  count: number;
  revenue: number;
}

export interface ClosureStats {
  totalBookings: number;
  completedBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  pendingBookings: number;
  totalRevenue: number;
  totalTherapistShare: number;
  totalVenueShare: number;
  totalPlatformShare: number;
  bookingsWithoutTherapistRate: number;
  byCategory: ClosureBucket[];
  byClientType: ClosureClientTypeBucket[];
  byTherapist: ClosureTherapistBucket[];
  byPaymentMethod: ClosureBucket[];
  byStatus: ClosureBucket[];
}

export interface ClosureReport {
  venue: ClosureVenue;
  date: string; // YYYY-MM-DD
  stats: ClosureStats;
  bookings: ClosureBooking[];
}

const STATUS_LABELS: Record<string, string> = {
  completed: "Complétée",
  confirmed: "Confirmée",
  pending: "En attente",
  cancelled: "Annulée",
  no_show: "No-show",
  declined: "Refusée",
  expired: "Expirée",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Carte — paiement en ligne",
  card_on_site: "Carte — sur place",
  cash: "Espèces",
  room: "Note de chambre",
  offert: "Offert",
  gift_amount: "Carte cadeau",
  voucher: "Payé par voucher",
  partner_billed: "Facturé au partenaire",
};

function bookingDuration(booking: ClosureBooking): number {
  if (booking.duration && booking.duration > 0) return booking.duration;
  return booking.treatments.reduce((sum, t) => sum + (t.duration ?? 0), 0);
}

function bumpBucket(map: Map<string, ClosureBucket>, key: string, label: string, revenue: number) {
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    existing.revenue += revenue;
  } else {
    map.set(key, { key, label, count: 1, revenue });
  }
}

export function computeClosureStats(
  bookings: ClosureBooking[],
  venue: ClosureVenue,
  therapistRates: TherapistRatesMap = {},
): ClosureStats {
  const stats: ClosureStats = {
    totalBookings: bookings.length,
    completedBookings: 0,
    confirmedBookings: 0,
    cancelledBookings: 0,
    noShowBookings: 0,
    pendingBookings: 0,
    totalRevenue: 0,
    totalTherapistShare: 0,
    totalVenueShare: 0,
    totalPlatformShare: 0,
    bookingsWithoutTherapistRate: 0,
    byCategory: [],
    byClientType: [],
    byTherapist: [],
    byPaymentMethod: [],
    byStatus: [],
  };

  const categoryMap = new Map<string, ClosureBucket>();
  const therapistMap = new Map<string, ClosureTherapistBucket>();
  const paymentMap = new Map<string, ClosureBucket>();
  const statusMap = new Map<string, ClosureBucket>();
  const clientTypeMap = new Map<ClientTypeValue, ClosureClientTypeBucket>();

  const venueRate = (venue.hotel_commission ?? 0) / 100;

  for (const booking of bookings) {
    const price = booking.total_price ?? 0;
    const isCompleted = booking.status === "completed";

    if (booking.status === "completed") stats.completedBookings += 1;
    else if (booking.status === "confirmed") stats.confirmedBookings += 1;
    else if (booking.status === "cancelled") stats.cancelledBookings += 1;
    else if (booking.status === "no_show") stats.noShowBookings += 1;
    else if (booking.status === "pending") stats.pendingBookings += 1;

    bumpBucket(statusMap, booking.status, STATUS_LABELS[booking.status] ?? booking.status, isCompleted ? price : 0);

    if (!isCompleted) continue;

    stats.totalRevenue += price;
    stats.totalVenueShare += price * venueRate;

    const rates = booking.therapist_id ? therapistRates[booking.therapist_id] ?? null : null;
    const duration = bookingDuration(booking);
    // Out-of-hours surcharge uplift (venue percent). NOTE: earnings are attributed
    // to the primary therapist only; a full per-therapist duo split in the daily
    // report is deferred (secondary therapist names are not part of this dataset).
    const surchargePercent = booking.is_out_of_hours
      ? (Number(venue.out_of_hours_surcharge_percent) || 0)
      : 0;
    const earnings =
      booking.therapist_id && duration > 0
        ? computeTherapistEarnings(rates, duration, { surchargePercent })
        : null;
    const therapistEarnings = earnings ?? 0;
    const hasRates = earnings !== null;
    if (booking.therapist_id && !hasRates) stats.bookingsWithoutTherapistRate += 1;
    stats.totalTherapistShare += therapistEarnings;

    const primaryCategory = booking.treatments[0]?.category ?? "Autres";
    bumpBucket(categoryMap, primaryCategory, primaryCategory, price);

    const ctKey = isBookingClientType(booking.client_type) ? booking.client_type : "external";
    const ctBucket = clientTypeMap.get(ctKey) ?? {
      key: ctKey,
      label: CLIENT_TYPE_LABELS[ctKey],
      count: 0,
      revenue: 0,
    };
    ctBucket.count += 1;
    ctBucket.revenue += price;
    clientTypeMap.set(ctKey, ctBucket);

    const therapistName = booking.therapist_name ?? "Non assigné";
    const therapistKey = booking.therapist_id ?? `name:${therapistName}`;
    const tExisting = therapistMap.get(therapistKey);
    if (tExisting) {
      tExisting.count += 1;
      tExisting.revenue += price;
      tExisting.earnings += therapistEarnings;
      tExisting.hasRates = tExisting.hasRates && hasRates;
    } else {
      therapistMap.set(therapistKey, {
        key: therapistKey,
        label: therapistName,
        count: 1,
        revenue: price,
        earnings: therapistEarnings,
        hasRates,
      });
    }

    const method = booking.payment_method ?? "unknown";
    bumpBucket(paymentMap, method, PAYMENT_METHOD_LABELS[method] ?? method, price);
  }

  stats.totalPlatformShare = stats.totalRevenue - stats.totalVenueShare - stats.totalTherapistShare;
  stats.byCategory = Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue);
  stats.byTherapist = Array.from(therapistMap.values()).sort((a, b) => b.revenue - a.revenue);
  stats.byPaymentMethod = Array.from(paymentMap.values()).sort((a, b) => b.revenue - a.revenue);
  stats.byStatus = Array.from(statusMap.values()).sort((a, b) => b.count - a.count);
  stats.byClientType = Array.from(clientTypeMap.values()).sort((a, b) => b.revenue - a.revenue);

  return stats;
}

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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

export interface RenderClosureReportOptions {
  includeDetails: boolean;
  hideCommissions?: boolean;
}

export function renderClosureReportHtml(report: ClosureReport, options: RenderClosureReportOptions): string {
  const { venue, date, stats, bookings } = report;
  const { includeDetails, hideCommissions = false } = options;
  const currency = venue.currency || "EUR";
  const money = (v: number) => fmtMoney(v, currency);

  const headline = `${stats.completedBookings} prestation${stats.completedBookings > 1 ? "s" : ""} · ${money(stats.totalRevenue)}`;

  const revenueRow = `
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0;">
      ${statCard("Prestations complétées", String(stats.completedBookings))}
      ${statCard("Chiffre d'affaires", money(stats.totalRevenue))}
      ${statCard("Confirmées (à venir)", String(stats.confirmedBookings), "#0ea5e9")}
      ${statCard("En attente", String(stats.pendingBookings), "#f59e0b")}
    </div>
  `;
  const commissionsRow = hideCommissions
    ? ""
    : `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 20px;">
      ${statCard("Part lieu", money(stats.totalVenueShare))}
      ${statCard("Part thérapeute", money(stats.totalTherapistShare))}
      ${statCard("Part plateforme", money(stats.totalPlatformShare))}
    </div>
  `;
  const lossRow = `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 24px;">
      ${statCard("Annulées", String(stats.cancelledBookings), "#dc2626")}
      ${statCard("No-show", String(stats.noShowBookings), "#dc2626")}
      ${statCard("Total bookings", String(stats.totalBookings), "#6b7280")}
    </div>
  `;

  const warningBanner =
    !hideCommissions && stats.bookingsWithoutTherapistRate > 0
      ? `<div style="margin:0 0 20px;padding:10px 14px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:13px;color:#92400e;">
          ⚠ ${stats.bookingsWithoutTherapistRate} prestation${stats.bookingsWithoutTherapistRate > 1 ? "s" : ""} sans tarif thérapeute défini — part thérapeute calculée à 0 sur ces lignes.
        </div>`
      : "";

  const categorySection = sectionTable(
    "Par type de prestation",
    ["Catégorie", "Prestations", "CA"],
    stats.byCategory.map((b) => [escapeHtml(b.label), String(b.count), money(b.revenue)]),
  );

  const clientTypeSection = sectionTable(
    "Par type de client",
    ["Type", "Prestations", "CA"],
    stats.byClientType.length
      ? stats.byClientType.map((b) => [escapeHtml(b.label), String(b.count), money(b.revenue)])
      : [],
  );

  const therapistHeaders = hideCommissions
    ? ["Thérapeute", "Prestations", "CA"]
    : ["Thérapeute", "Prestations", "CA", "Part thérapeute"];
  const therapistSection = stats.byTherapist.length
    ? sectionTable(
        "Par thérapeute",
        therapistHeaders,
        stats.byTherapist.map((b) => {
          const base = [escapeHtml(b.label), String(b.count), money(b.revenue)];
          if (hideCommissions) return base;
          return [...base, b.hasRates ? money(b.earnings) : `<span style="color:#dc2626">—</span>`];
        }),
      )
    : "";

  const paymentSection = stats.byPaymentMethod.length
    ? sectionTable(
        "Par moyen de paiement",
        ["Moyen", "Prestations", "Montant"],
        stats.byPaymentMethod.map((b) => [escapeHtml(b.label), String(b.count), money(b.revenue)]),
      )
    : "";

  const detailRows = bookings
    .slice()
    .sort((a, b) => a.booking_time.localeCompare(b.booking_time))
    .map((b) => {
      const treatments = b.treatments.map((t) => t.name).join(", ");
      return `
        <tr>
          <td style="${cellBase}">${escapeHtml(b.booking_time.slice(0, 5))}</td>
          <td style="${cellBase}">#${b.booking_id}</td>
          <td style="${cellBase}">${escapeHtml(`${b.client_first_name} ${b.client_last_name}`)}${b.room_number ? ` <span style="color:#6b7280">· ch. ${escapeHtml(b.room_number)}</span>` : ""}</td>
          <td style="${cellBase}">${escapeHtml(treatments || "—")}</td>
          <td style="${cellBase}">${escapeHtml(b.therapist_name ?? "—")}</td>
          <td style="${cellBase};text-align:right;">${b.total_price != null ? money(b.total_price) : "—"}</td>
          <td style="${cellBase}">${escapeHtml(STATUS_LABELS[b.status] ?? b.status)}</td>
        </tr>`;
    })
    .join("");

  const detailSection = includeDetails && bookings.length
    ? `
        <h2 style="${sectionTitle}">Détail des prestations</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="${cellHeader}">Heure</th>
              <th style="${cellHeader}">N°</th>
              <th style="${cellHeader}">Client</th>
              <th style="${cellHeader}">Prestation(s)</th>
              <th style="${cellHeader}">Thérapeute</th>
              <th style="${cellHeader};text-align:right;">Prix</th>
              <th style="${cellHeader}">Statut</th>
            </tr>
          </thead>
          <tbody>${detailRows}</tbody>
        </table>
      `
    : "";

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Clôture ${escapeHtml(venue.name)} - ${escapeHtml(date)}</title></head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;background:#ffffff;">
  <div style="max-width:780px;margin:0 auto;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #111827;padding-bottom:16px;margin-bottom:8px;">
      <div>
        <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">${escapeHtml(brand.name)} · Clôture quotidienne</p>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:600;">${escapeHtml(venue.name)}</h1>
        <p style="margin:4px 0 0;font-size:14px;color:#374151;">${escapeHtml(fmtDateLong(date))}</p>
      </div>
      <div style="text-align:right;">
        <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Résultat du jour</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:600;">${escapeHtml(headline)}</p>
      </div>
    </div>

    ${warningBanner}
    ${revenueRow}
    ${commissionsRow}
    ${lossRow}
    ${categorySection}
    ${clientTypeSection}
    ${therapistSection}
    ${paymentSection}
    ${detailSection}

    <p style="margin-top:32px;font-size:11px;color:#9ca3af;text-align:center;">
      Rapport généré par ${escapeHtml(brand.name)} · ${escapeHtml(new Date().toLocaleString("fr-FR"))}
    </p>
  </div>
</body></html>`;
}

const cellBase = "padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#111827;";
const cellHeader = "padding:8px 10px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:1px solid #e5e7eb;";
const sectionTitle = "margin:24px 0 12px;font-size:14px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:0.05em;";

function statCard(label: string, value: string, accent = "#111827"): string {
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;background:#ffffff;">
      <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</p>
      <p style="margin:8px 0 0;font-size:20px;font-weight:600;color:${accent};">${escapeHtml(value)}</p>
    </div>`;
}

function sectionTable(title: string, headers: string[], rows: string[][]): string {
  if (!rows.length) return "";
  const head = headers
    .map((h, i) => `<th style="${cellHeader}${i === headers.length - 1 ? ";text-align:right" : ""}">${escapeHtml(h)}</th>`)
    .join("");
  const body = rows
    .map(
      (cells) =>
        `<tr>${cells
          .map((c, i) => `<td style="${cellBase}${i === cells.length - 1 ? ";text-align:right" : ""}">${c}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `
    <h2 style="${sectionTitle}">${escapeHtml(title)}</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      <thead><tr style="background:#f9fafb;">${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}
