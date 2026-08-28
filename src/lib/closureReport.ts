// Daily closure report — pure data + HTML rendering.
// Shared by the on-screen preview, the PDF export, and the recipient email body.

import { brand } from "@/config/brand";
import { computeTherapistEarnings, type TherapistRates } from "@/lib/therapistEarnings";
import { isBookingClientType, type BookingClientType } from "@/lib/clientTypeMeta";
import { splitBookingByTherapist } from "@/lib/closureTherapistSplit";

export interface ClosureBookingTreatment {
  name: string;
  category: string | null;
  duration: number | null;
  /** Thérapeute qui réalise ce soin — porté par booking_treatments sur les duos. */
  therapist_id?: string | null;
  is_addon?: boolean | null;
  /** Prix résolu de la ligne (resolveTreatmentPrice), pour la répartition en duo. */
  price?: number | null;
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
  /** Thérapeutes ayant accepté, dans l'ordre d'assignation (duos). */
  therapists?: Array<{ id: string; name: string }>;
  guest_count?: number | null;
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
  /** Organisation propriétaire du lieu — c'est elle qui signe le rapport. */
  organization_name?: string | null;
}

/**
 * Émetteur affiché sur le rapport : l'organisation du lieu, avec repli sur la
 * marque de la plateforme quand le lieu n'est rattaché à aucune organisation.
 */
export function closureIssuer(venue: ClosureVenue): string {
  return venue.organization_name?.trim() || brand.name;
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

/** Couleur de série par type de client — partagée par le graphe écran et le rapport. */
export const CLIENT_TYPE_COLORS: Record<ClientTypeValue, string> = {
  hotel: "#2563eb",
  staycation: "#e11d48",
  classpass: "#4b5563",
  sezame: "#0d9488",
  external: "#f59e0b",
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
  /** Part du nombre de prestations complétées, en pourcentage (0-100). */
  sharePercent: number;
}

/** Croisement type de client × moyen de paiement, sur les prestations complétées. */
export interface ClosureClientPaymentBucket {
  clientTypeKey: ClientTypeValue;
  clientTypeLabel: string;
  paymentKey: string;
  paymentLabel: string;
  count: number;
  revenue: number;
}

export interface ClosureStats {
  totalBookings: number;
  completedBookings: number;
  confirmedBookings: number;
  /** Résas retenues dans le CA : les complétées, plus les non finalisées si incluses. */
  countedBookings: number;
  /** CA que représenteraient les résas non finalisées, qu'elles soient incluses ou non. */
  unfinalizedRevenue: number;
  /** Vrai quand les résas non finalisées ont été comptées dans les totaux. */
  includedUnfinalized: boolean;
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
  byClientTypeAndPayment: ClosureClientPaymentBucket[];
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
  no_show: "No show",
  declined: "Refusée",
  expired: "Expirée",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Carte — paiement en ligne",
  card_on_site: "Carte — sur place",
  cash: "Espèces",
  room: "Facturé en chambre",
  offert: "Offert",
  gift_amount: "Carte cadeau",
  voucher: "Payé par voucher",
  partner_billed: "Facturé au partenaire",
  cure_fresha: "Cure Fresha",
};

// Repli quand payment_method n'est pas renseigné : c'est le cas des règlements
// sur place (seuls les paiements en ligne écrivent un payment_method). Sans ce
// repli la clôture affichait « — » pour toutes les prestations hors ligne.
const PAYMENT_STATUS_FALLBACK_LABELS: Record<string, string> = {
  paid: "Payé",
  pending: "À régler sur place",
  charged_to_room: "Facturé en chambre",
  pending_partner_billing: "Facturé au partenaire",
  offert: "Offert",
  refunded: "Remboursé",
  failed: "Paiement échoué",
};

/** Libellé du mode de paiement tel qu'affiché dans la clôture. */
export function closurePaymentLabel(
  method: string | null | undefined,
  status?: string | null,
): string {
  if (method) return PAYMENT_METHOD_LABELS[method] ?? method;
  if (status) return PAYMENT_STATUS_FALLBACK_LABELS[status] ?? status;
  return "—";
}

/** Numéro de chambre — seuls les résidents de l'hôtel en ont un. */
export function closureRoomNumber(booking: Pick<ClosureBooking, "client_type" | "room_number">): string {
  if (booking.client_type !== "hotel") return "—";
  return booking.room_number?.trim() || "—";
}

/**
 * Intervenants d'une réservation, tels qu'affichés dans le détail. Un duo en
 * compte deux : n'afficher que `therapist_name` contredirait la répartition.
 */
export function closureTherapistNames(
  booking: Pick<ClosureBooking, "therapists" | "therapist_name">,
): string {
  const names = (booking.therapists ?? []).map((t) => t.name?.trim()).filter(Boolean);
  if (names.length) return names.join(" + ");
  return booking.therapist_name?.trim() || "—";
}

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

/**
 * Statuts d'une résa qui a bien eu lieu mais que le cron n'a pas encore
 * finalisée — typiquement un soin du soir consulté avant son terme.
 */
const UNFINALIZED_STATUSES = ["confirmed"];

export interface ComputeClosureStatsOptions {
  /**
   * Compte les résas non finalisées dans le CA et les répartitions, comme si
   * elles étaient complétées. Purement projectif : rien n'est écrit en base et
   * leur statut réel reste affiché tel quel dans le détail.
   */
  includeUnfinalized?: boolean;
}

export function computeClosureStats(
  bookings: ClosureBooking[],
  venue: ClosureVenue,
  therapistRates: TherapistRatesMap = {},
  options: ComputeClosureStatsOptions = {},
): ClosureStats {
  const { includeUnfinalized = false } = options;
  const stats: ClosureStats = {
    totalBookings: bookings.length,
    completedBookings: 0,
    confirmedBookings: 0,
    countedBookings: 0,
    unfinalizedRevenue: 0,
    includedUnfinalized: includeUnfinalized,
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
    byClientTypeAndPayment: [],
    byStatus: [],
  };

  const categoryMap = new Map<string, ClosureBucket>();
  const therapistMap = new Map<string, ClosureTherapistBucket>();
  const paymentMap = new Map<string, ClosureBucket>();
  const statusMap = new Map<string, ClosureBucket>();
  const clientTypeMap = new Map<ClientTypeValue, ClosureClientTypeBucket>();
  const crossMap = new Map<string, ClosureClientPaymentBucket>();

  const venueRate = (venue.hotel_commission ?? 0) / 100;

  for (const booking of bookings) {
    const price = booking.total_price ?? 0;
    const isUnfinalized = UNFINALIZED_STATUSES.includes(booking.status);
    const isCounted = booking.status === "completed" || (includeUnfinalized && isUnfinalized);

    if (booking.status === "completed") stats.completedBookings += 1;
    else if (booking.status === "confirmed") stats.confirmedBookings += 1;
    else if (booking.status === "cancelled") stats.cancelledBookings += 1;
    else if (booking.status === "no_show") stats.noShowBookings += 1;
    else if (booking.status === "pending") stats.pendingBookings += 1;

    if (isUnfinalized) stats.unfinalizedRevenue += price;

    bumpBucket(statusMap, booking.status, STATUS_LABELS[booking.status] ?? booking.status, isCounted ? price : 0);

    if (!isCounted) continue;

    stats.countedBookings += 1;
    stats.totalRevenue += price;
    stats.totalVenueShare += price * venueRate;

    // Majoration hors horaires (pourcentage du lieu).
    const surchargePercent = booking.is_out_of_hours
      ? (Number(venue.out_of_hours_surcharge_percent) || 0)
      : 0;

    // Un duo est réparti entre ses thérapeutes : chacun est crédité de son propre
    // soin, et rémunéré sur ses propres tarifs pour la durée qu'il a réellement
    // travaillée. Un solo renvoie une part unique, identique au calcul précédent.
    const parts = splitBookingByTherapist({
      lines: booking.treatments.map((t) => ({
        therapist_id: t.therapist_id ?? null,
        duration: t.duration,
        is_addon: t.is_addon ?? false,
        price: t.price ?? 0,
      })),
      orderedTherapistIds: (booking.therapists ?? []).map((t) => t.id),
      guestCount: booking.guest_count ?? 1,
      primaryTherapistId: booking.therapist_id,
      totalPrice: price,
      bookingDuration: bookingDuration(booking),
    });

    // Première catégorie renseignée : les lignes sans soin lisible sont gardées
    // pour la répartition en duo, elles ne doivent pas basculer la catégorie.
    const primaryCategory = booking.treatments.find((t) => t.category)?.category ?? "Autres";
    bumpBucket(categoryMap, primaryCategory, primaryCategory, price);

    const ctKey = isBookingClientType(booking.client_type) ? booking.client_type : "external";
    const ctBucket = clientTypeMap.get(ctKey) ?? {
      key: ctKey,
      label: CLIENT_TYPE_LABELS[ctKey],
      count: 0,
      revenue: 0,
      sharePercent: 0,
    };
    ctBucket.count += 1;
    ctBucket.revenue += price;
    clientTypeMap.set(ctKey, ctBucket);

    const namesById = new Map((booking.therapists ?? []).map((t) => [t.id, t.name]));
    for (const part of parts) {
      const rates = part.therapistId ? therapistRates[part.therapistId] ?? null : null;
      const earnings =
        part.therapistId && part.duration > 0
          ? computeTherapistEarnings(rates, part.duration, { surchargePercent })
          : null;
      const partEarnings = earnings ?? 0;
      const hasRates = earnings !== null;
      if (part.therapistId && !hasRates) stats.bookingsWithoutTherapistRate += 1;
      stats.totalTherapistShare += partEarnings;

      // Le nom du roster prime ; le snapshot `therapist_name` de la réservation
      // ne vaut que pour le thérapeute principal, jamais pour son binôme.
      const therapistName =
        (part.therapistId ? namesById.get(part.therapistId) : null)?.trim() ||
        (part.therapistId && part.therapistId === booking.therapist_id
          ? booking.therapist_name
          : null) ||
        (part.therapistId ? null : booking.therapist_name) ||
        "Non assigné";
      const therapistKey = part.therapistId ?? `name:${therapistName}`;
      const tExisting = therapistMap.get(therapistKey);
      if (tExisting) {
        tExisting.count += 1;
        tExisting.revenue += part.revenue;
        tExisting.earnings += partEarnings;
        tExisting.hasRates = tExisting.hasRates && hasRates;
      } else {
        therapistMap.set(therapistKey, {
          key: therapistKey,
          label: therapistName,
          count: 1,
          revenue: part.revenue,
          earnings: partEarnings,
          hasRates,
        });
      }
    }

    // Les règlements sur place n'ont pas de payment_method : on retombe sur le
    // statut pour qu'ils apparaissent aussi dans la répartition.
    const methodKey = booking.payment_method ?? `status:${booking.payment_status ?? "unknown"}`;
    const methodLabel = closurePaymentLabel(booking.payment_method, booking.payment_status);
    bumpBucket(paymentMap, methodKey, methodLabel, price);

    const crossKey = `${ctKey}|${methodKey}`;
    const crossBucket = crossMap.get(crossKey) ?? {
      clientTypeKey: ctKey,
      clientTypeLabel: CLIENT_TYPE_LABELS[ctKey],
      paymentKey: methodKey,
      paymentLabel: methodLabel,
      count: 0,
      revenue: 0,
    };
    crossBucket.count += 1;
    crossBucket.revenue += price;
    crossMap.set(crossKey, crossBucket);
  }

  stats.totalPlatformShare = stats.totalRevenue - stats.totalVenueShare - stats.totalTherapistShare;
  stats.byCategory = Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue);
  stats.byTherapist = Array.from(therapistMap.values()).sort((a, b) => b.revenue - a.revenue);
  stats.byPaymentMethod = Array.from(paymentMap.values()).sort((a, b) => b.revenue - a.revenue);
  stats.byStatus = Array.from(statusMap.values()).sort((a, b) => b.count - a.count);
  stats.byClientTypeAndPayment = Array.from(crossMap.values()).sort(
    (a, b) =>
      a.clientTypeLabel.localeCompare(b.clientTypeLabel, "fr") || b.revenue - a.revenue,
  );
  const clientTypeTotal = Array.from(clientTypeMap.values()).reduce((sum, b) => sum + b.count, 0);
  stats.byClientType = Array.from(clientTypeMap.values())
    .map((b) => ({ ...b, sharePercent: clientTypeTotal ? (b.count / clientTypeTotal) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  return stats;
}

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function fmtPercent(value: number): string {
  return `${Math.round(value)} %`;
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

  const headline = `${stats.countedBookings} prestation${stats.countedBookings > 1 ? "s" : ""} · ${money(stats.totalRevenue)}`;

  const revenueRow = `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0;">
      ${statCard(
        stats.includedUnfinalized ? "Prestations comptées" : "Prestations complétées",
        String(stats.countedBookings),
      )}
      ${statCard("Chiffre d'affaires", money(stats.totalRevenue))}
    </div>
  `;
  const lossRow = `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 24px;">
      ${statCard("Annulées", String(stats.cancelledBookings), "#dc2626")}
      ${statCard("No show", String(stats.noShowBookings), "#dc2626")}
      ${statCard("Nombre total de réservations", String(stats.totalBookings), "#6b7280")}
    </div>
  `;

  // Le lecteur du rapport doit savoir que des prestations non encore terminées
  // sont comptées : sans cette mention, le CA n'est pas rapprochable de la base.
  const unfinalizedBanner =
    stats.includedUnfinalized && stats.confirmedBookings > 0
      ? `<div style="margin:0 0 20px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;color:#1e40af;">
          ℹ ${stats.confirmedBookings} réservation${stats.confirmedBookings > 1 ? "s" : ""} non encore finalisée${stats.confirmedBookings > 1 ? "s" : ""} (${money(stats.unfinalizedRevenue)}) ${stats.confirmedBookings > 1 ? "sont comptées" : "est comptée"} dans ce rapport.
        </div>`
      : "";

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
    ["Type", "Prestations", "Part", "CA"],
    stats.byClientType.map((b) => [
      escapeHtml(b.label),
      String(b.count),
      escapeHtml(fmtPercent(b.sharePercent)),
      money(b.revenue),
    ]),
  );

  const therapistSection = sectionTable(
    "Par thérapeute",
    // « Prestations réalisées » et non « Prestations » : sur un duo, chacun des
    // deux thérapeutes en compte une, donc le total dépasse le nombre de résas.
    ["Thérapeute", "Prestations réalisées", "CA"],
    stats.byTherapist.map((b) => [escapeHtml(b.label), String(b.count), money(b.revenue)]),
  );

  const paymentSection = stats.byPaymentMethod.length
    ? sectionTable(
        "Par moyen de paiement",
        ["Moyen", "Prestations", "Montant"],
        stats.byPaymentMethod.map((b) => [escapeHtml(b.label), String(b.count), money(b.revenue)]),
      )
    : "";

  const clientPaymentSection = sectionTable(
    "Type de client × moyen de paiement",
    ["Type de client", "Moyen de paiement", "Prestations", "CA"],
    stats.byClientTypeAndPayment.map((b) => [
      escapeHtml(b.clientTypeLabel),
      escapeHtml(b.paymentLabel),
      String(b.count),
      money(b.revenue),
    ]),
  );

  const detailRows = bookings
    .slice()
    .sort((a, b) => a.booking_time.localeCompare(b.booking_time))
    .map((b) => {
      const treatments = b.treatments
        .map((t) => t.name)
        .filter((name) => name && name !== "—")
        .join(", ");
      return `
        <tr>
          <td style="${cellBase}">#${b.booking_id}</td>
          <td style="${cellBase}">${escapeHtml(`${b.client_first_name} ${b.client_last_name}`)}</td>
          <td style="${cellBase}">${escapeHtml(closureRoomNumber(b))}</td>
          <td style="${cellBase}">${escapeHtml(treatments || "—")}</td>
          <td style="${cellBase}">${escapeHtml(closureTherapistNames(b))}</td>
          <td style="${cellBase};text-align:right;">${b.total_price != null ? money(b.total_price) : "—"}</td>
          <td style="${cellBase}">${escapeHtml(closurePaymentLabel(b.payment_method, b.payment_status))}</td>
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
              <th style="${cellHeader}">N°</th>
              <th style="${cellHeader}">Client</th>
              <th style="${cellHeader}">Chambre</th>
              <th style="${cellHeader}">Prestation(s)</th>
              <th style="${cellHeader}">Thérapeute</th>
              <th style="${cellHeader};text-align:right;">Prix</th>
              <th style="${cellHeader}">Paiement</th>
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
        <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">${escapeHtml(closureIssuer(venue))} · Clôture quotidienne</p>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:600;">${escapeHtml(venue.name)}</h1>
        <p style="margin:4px 0 0;font-size:14px;color:#374151;">${escapeHtml(fmtDateLong(date))}</p>
      </div>
      <div style="text-align:right;">
        <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Résultat du jour</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:600;">${escapeHtml(headline)}</p>
      </div>
    </div>

    ${unfinalizedBanner}
    ${warningBanner}
    ${revenueRow}
    ${lossRow}
    ${detailSection}
    ${categorySection}
    ${clientTypeSection}
    ${therapistSection}
    ${paymentSection}
    ${clientPaymentSection}

    <p style="margin-top:32px;font-size:11px;color:#9ca3af;text-align:center;">
      Rapport généré par ${escapeHtml(closureIssuer(venue))} · ${escapeHtml(new Date().toLocaleString("fr-FR"))}
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
