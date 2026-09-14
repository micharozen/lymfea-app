// Daily closure report — pure data + HTML rendering.
// Shared by the on-screen preview, the PDF export, and the recipient email body.

import { brand } from "@/config/brand";
import {
  computeLegEarnings,
  type TherapistRates,
  type TreatmentRateMap,
} from "@/lib/therapistEarnings";
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
  /** `booking_treatments.treatment_id` — porte le barème spécifique éventuel du soin. */
  treatment_id?: string | null;
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

/**
 * Barèmes spécifiques par soin, par thérapeute. Une entrée absente ou nulle
 * signifie « pas de barème spécifique applicable » — c'est notamment ce que
 * l'appelant passe quand `treatment_rates_active` est false.
 */
export type TherapistTreatmentRatesMap = Record<string, TreatmentRateMap | null>;

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
  noshow: "No show",
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
  /** Barèmes spécifiques par soin, par thérapeute. Vide = comportement historique. */
  therapistTreatmentRates?: TherapistTreatmentRatesMap;
}

export function computeClosureStats(
  bookings: ClosureBooking[],
  venue: ClosureVenue,
  therapistRates: TherapistRatesMap = {},
  options: ComputeClosureStatsOptions = {},
): ClosureStats {
  const { includeUnfinalized = false, therapistTreatmentRates = {} } = options;
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
    else if (booking.status === "no_show" || booking.status === "noshow") stats.noShowBookings += 1;
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
        treatment_id: t.treatment_id ?? null,
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
      const treatmentRates = part.therapistId
        ? therapistTreatmentRates[part.therapistId] ?? null
        : null;
      const earnings =
        part.therapistId && part.duration > 0
          ? computeLegEarnings(
              rates,
              treatmentRates,
              { totalDuration: part.duration, lines: part.lines },
              { surchargePercent },
            )
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

  const averageTicket = stats.countedBookings > 0 ? stats.totalRevenue / stats.countedBookings : 0;
  const completionRate =
    stats.totalBookings > 0 ? (stats.countedBookings / stats.totalBookings) * 100 : 0;

  // Bande du jour : un seul chiffre lu en premier, les autres le nuancent.
  // La répartition des commissions n'y figure pas : ce rapport part au lieu.
  const summaryBand = `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px;border:1px solid ${LINE};border-radius:12px;padding:20px 22px;margin:20px 0 24px;">
      <div>
        <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${INK_SOFT};">
          ${escapeHtml(stats.includedUnfinalized ? "Chiffre d'affaires projeté" : "Chiffre d'affaires réalisé")}
        </p>
        <p style="margin:6px 0 0;font-size:34px;font-weight:600;line-height:1;">${escapeHtml(money(stats.totalRevenue))}</p>
        <p style="margin:8px 0 0;font-size:13px;color:${INK_SOFT};">
          ${stats.countedBookings} prestation${stats.countedBookings > 1 ? "s" : ""} comptée${stats.countedBookings > 1 ? "s" : ""} sur ${stats.totalBookings} réservation${stats.totalBookings > 1 ? "s" : ""}, soit ${escapeHtml(fmtPercent(completionRate))} réalisé${stats.includedUnfinalized ? " ou à venir" : " à date"}
        </p>
      </div>
      <div style="display:flex;">
        ${bandStat("Panier moyen", money(averageTicket), false)}
        ${bandStat("Nombre total de réservations", String(stats.totalBookings), true)}
        ${bandStat("Annulées", String(stats.cancelledBookings), true, stats.cancelledBookings > 0 ? CRIT : undefined)}
        ${bandStat("No show", String(stats.noShowBookings), true, stats.noShowBookings > 0 ? CRIT : undefined)}
      </div>
    </div>
  `;

  // Le lecteur du rapport doit savoir que des prestations non encore terminées
  // sont comptées : sans cette mention, le CA n'est pas rapprochable de la base.
  const unfinalizedBanner =
    stats.includedUnfinalized && stats.confirmedBookings > 0
      ? `<div style="margin:18px 0 0;padding:11px 14px;background:#EEF3F8;border:1px solid #C9D8E6;border-radius:10px;font-size:13px;color:#3E5C7A;">
          ℹ ${stats.confirmedBookings} réservation${stats.confirmedBookings > 1 ? "s" : ""} non encore finalisée${stats.confirmedBookings > 1 ? "s" : ""} (${money(stats.unfinalizedRevenue)}) ${stats.confirmedBookings > 1 ? "sont comptées" : "est comptée"} dans ce rapport.
        </div>`
      : "";

  const warningBanner =
    !hideCommissions && stats.bookingsWithoutTherapistRate > 0
      ? `<div style="margin:18px 0 0;padding:11px 14px;background:#F9F0DC;border:1px solid #E4CB92;border-radius:10px;font-size:13px;color:#8A6216;">
          ⚠ ${stats.bookingsWithoutTherapistRate} prestation${stats.bookingsWithoutTherapistRate > 1 ? "s" : ""} sans tarif thérapeute défini — part thérapeute calculée à 0 sur ces lignes.
        </div>`
      : "";

  const categorySection = breakdownTable(
    "Par type de prestation",
    "Catégorie",
    withRevenueShare(stats.byCategory).map((b) => ({
      label: b.label,
      count: b.count,
      share: b.share,
      amount: money(b.revenue),
    })),
  );

  const clientTypeSection = breakdownTable(
    "Par type de client",
    "Type",
    stats.byClientType.map((b) => ({
      label: b.label,
      count: b.count,
      share: b.sharePercent,
      amount: money(b.revenue),
    })),
  );

  const therapistSection = breakdownTable(
    "Par thérapeute",
    "Thérapeute",
    stats.byTherapist.map((b) => ({
      label: b.label,
      count: b.count,
      share: 0,
      amount: money(b.revenue),
    })),
    // « Prestations réalisées » et non « Prestations » : sur un duo, chacun des
    // deux thérapeutes en compte une, donc le total dépasse le nombre de résas.
    { countHeader: "Prestations réalisées", hideShare: true },
  );

  const paymentSection = breakdownTable(
    "Par moyen de paiement",
    "Moyen",
    withRevenueShare(stats.byPaymentMethod).map((b) => ({
      label: b.label,
      count: b.count,
      share: b.share,
      amount: money(b.revenue),
    })),
  );

  const clientPaymentSection = breakdownTable(
    "Type de client × moyen de paiement",
    "Croisement",
    withRevenueShare(stats.byClientTypeAndPayment).map((b) => ({
      label: `${b.clientTypeLabel} · ${b.paymentLabel}`,
      count: b.count,
      share: b.share,
      amount: money(b.revenue),
    })),
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
          <td style="${cellBase}">${statusPill(b.status)}</td>
        </tr>`;
    })
    .join("");

  const detailSection = includeDetails && bookings.length
    ? `
        <h2 style="${sectionTitle}">Détail des prestations</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr>
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
<html lang="fr"><head><meta charset="utf-8"><title>Clôture ${escapeHtml(venue.name)} - ${escapeHtml(date)}</title>
<style>
  tr { page-break-inside: avoid; }
  h2 { page-break-after: avoid; }
  table { page-break-inside: auto; }
</style>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};background:#ffffff;">
  <div style="max-width:780px;margin:0 auto;">
    <div style="border-bottom:2px solid ${ACCENT};padding-bottom:14px;">
      <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${INK_SOFT};">${escapeHtml(closureIssuer(venue))} · Clôture quotidienne</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:600;">${escapeHtml(venue.name)}</h1>
      <p style="margin:4px 0 0;font-size:14px;color:${INK_SOFT};">${escapeHtml(fmtDateLong(date))}</p>
    </div>

    ${unfinalizedBanner}
    ${warningBanner}
    ${summaryBand}
    ${detailSection}
    ${categorySection}
    ${clientTypeSection}
    ${therapistSection}
    ${paymentSection}
    ${clientPaymentSection}

    <p style="margin-top:32px;font-size:11px;color:${INK_FAINT};text-align:center;">
      Rapport généré par ${escapeHtml(closureIssuer(venue))} · ${escapeHtml(new Date().toLocaleString("fr-FR"))}
    </p>
  </div>
</body></html>`;
}

const INK = "#241E1B";
const INK_SOFT = "#6E635C";
const INK_FAINT = "#9A8F87";
const LINE = "#E7DFD7";
const LINE_SOFT = "#F0E9E2";

const OK = "#3F6B4C";
const INFO = "#3E5C7A";
const CRIT = "#9B4238";
const ACCENT = "#C4714A";

/** Pastille de statut : la couleur code l'état, jamais la décoration. */
const STATUS_TONES: Record<string, { fg: string }> = {
  completed: { fg: OK },
  confirmed: { fg: INFO },
  pending: { fg: INFO },
  cancelled: { fg: CRIT },
  no_show: { fg: CRIT },
  noshow: { fg: CRIT },
  declined: { fg: CRIT },
  expired: { fg: INK_SOFT },
};

function statusPill(status: string): string {
  const tone = STATUS_TONES[status] ?? { fg: INK_SOFT };
  const label = STATUS_LABELS[status] ?? status;
  // Statut en couleur, sans pastille : html2canvas décale la boîte de fond des
  // éléments en ligne, quelle que soit la technique (inline-block, hauteur
  // forcée, table en ligne). La couleur du texte, elle, est toujours juste.
  return `<span style="color:${tone.fg};font-weight:500;white-space:nowrap;">${escapeHtml(label)}</span>`;
}

const cellBase = `padding:8px 10px;border-bottom:1px solid ${LINE_SOFT};font-size:12px;color:${INK};`;
const cellHeader = `padding:8px 10px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${INK_FAINT};border-bottom:1px solid ${LINE};`;
const sectionTitle = `margin:26px 0 10px;font-size:13px;font-weight:600;color:${INK};`;

/** Statistique secondaire du bandeau : séparée par un filet, jamais encadrée. */
function bandStat(label: string, value: string, divider: boolean, tone?: string): string {
  return `
    <div style="padding:0 18px;${divider ? `border-left:1px solid ${LINE};` : "padding-left:0;"}">
      <p style="margin:0;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${INK_FAINT};white-space:nowrap;">${escapeHtml(label)}</p>
      <p style="margin:6px 0 0;font-size:17px;font-weight:600;color:${tone ?? INK};">${escapeHtml(value)}</p>
    </div>`;
}

/** Ajoute à chaque tranche sa part du total, pour la barre de proportion. */
function withRevenueShare<T extends { revenue: number }>(buckets: T[]): Array<T & { share: number }> {
  const total = buckets.reduce((sum, b) => sum + b.revenue, 0);
  return buckets.map((b) => ({ ...b, share: total > 0 ? (b.revenue / total) * 100 : 0 }));
}

interface BreakdownRow {
  label: string;
  count: number;
  share: number;
  amount: string;
}

/**
 * Table de répartition : chaque ligne porte sa part en pourcentage, pour qu'un
 * total se lise sans calcul. Volontairement sans jauge : le rapport part au
 * lieu comme document de chiffres, la barre de proportion reste à l'écran.
 */
interface BreakdownTableOptions {
  /** En-tête de la colonne de comptage. */
  countHeader?: string;
  /** Masque la colonne de part quand elle n'a pas de sens. */
  hideShare?: boolean;
}

function breakdownTable(
  title: string,
  labelHeader: string,
  rows: BreakdownRow[],
  options: BreakdownTableOptions = {},
): string {
  if (!rows.length) return "";
  const { countHeader = "Prestations", hideShare = false } = options;
  const shareHeader = hideShare ? "" : `<th style="${cellHeader};text-align:right;">Part</th>`;
  const body = rows
    .map((r) => {
      const shareCell = hideShare
        ? ""
        : `<td style="${cellBase};text-align:right;color:${INK_SOFT};width:70px;">${escapeHtml(fmtPercent(r.share))}</td>`;
      return `
        <tr>
          <td style="${cellBase}">${escapeHtml(r.label)}</td>
          <td style="${cellBase};text-align:right;width:90px;">${escapeHtml(String(r.count))}</td>
          ${shareCell}
          <td style="${cellBase};text-align:right;width:120px;">${r.amount}</td>
        </tr>`;
    })
    .join("");
  return `
    <h2 style="${sectionTitle}">${escapeHtml(title)}</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      <thead><tr>
        <th style="${cellHeader}">${escapeHtml(labelHeader)}</th>
        <th style="${cellHeader};text-align:right;">${escapeHtml(countHeader)}</th>
        ${shareHeader}
        <th style="${cellHeader};text-align:right;">CA</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}
