import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { renderClosureEmailHtml } from "../_shared/closureReportHtml.ts";
import {
  computeLegEarnings,
  type TherapistRates,
  type TreatmentRateMap,
} from "../_shared/therapistEarnings.ts";
import { normalizeClientType, clientTypeLabel, type BookingClientType } from "../_shared/client-type.ts";
import { splitBookingByTherapist, orderRoster } from "../_shared/closureTherapistSplit.ts";
import { resolveTreatmentPrice } from "../_shared/treatmentPrice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClosureRequest {
  hotel_id: string;
  report_date: string; // YYYY-MM-DD
  recipients: string[];
  include_details?: boolean;
  hide_commissions?: boolean;
  /** Compte les résas encore confirmées dans les totaux, comme l'écran de clôture. */
  include_unfinalized?: boolean;
}

/** Statuts d'une résa qui a eu lieu mais que le cron n'a pas encore finalisée. */
const UNFINALIZED_STATUSES = ["confirmed"];

type ClientTypeValue = BookingClientType;

interface RawBooking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  client_type: string;
  room_number: string | null;
  therapist_id: string | null;
  therapist_name: string | null;
  duration: number | null;
  guest_count: number | null;
  total_price: number | null;
  is_out_of_hours: boolean | null;
  payment_method: string | null;
  payment_status: string | null;
  status: string;
  booking_treatments?: Array<{
    therapist_id: string | null;
    treatment_id: string | null;
    is_addon: boolean | null;
    price_override: number | null;
    treatment_menus: {
      name: string;
      category: string | null;
      duration: number | null;
      price: number | null;
    } | null;
    treatment_variants: { duration: number | null; price: number | null } | null;
  }> | null;
  booking_therapists?: Array<{
    therapist_id: string;
    status: string | null;
    assigned_at: string | null;
  }> | null;
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
// sur place (seuls les paiements en ligne écrivent un payment_method).
const PAYMENT_STATUS_FALLBACK_LABELS: Record<string, string> = {
  paid: "Payé",
  pending: "À régler sur place",
  charged_to_room: "Facturé en chambre",
  pending_partner_billing: "Facturé au partenaire",
  offert: "Offert",
  refunded: "Remboursé",
  failed: "Paiement échoué",
};

function paymentLabel(method: string | null, status: string | null): string {
  if (method) return PAYMENT_METHOD_LABELS[method] ?? method;
  if (status) return PAYMENT_STATUS_FALLBACK_LABELS[status] ?? status;
  return "—";
}

/** Numéro de chambre — seuls les résidents de l'hôtel en ont un. */
function roomNumberLabel(b: RawBooking): string {
  if (normalizeClientType(b.client_type) !== "hotel") return "—";
  return b.room_number?.trim() || "—";
}

function fmtPercent(value: number): string {
  return `${Math.round(value)} %`;
}


const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Durée d'une ligne : la variante choisie prime sur la durée du soin au menu. */
function lineDuration(bt: NonNullable<RawBooking["booking_treatments"]>[number]): number {
  return bt.treatment_variants?.duration ?? bt.treatment_menus?.duration ?? 0;
}

function bookingDuration(booking: RawBooking): number {
  if (booking.duration && booking.duration > 0) return booking.duration;
  return (booking.booking_treatments ?? []).reduce((sum, bt) => sum + lineDuration(bt), 0);
}

/** Intervenants de la réservation — un duo en compte deux. */
function therapistNames(b: RawBooking, namesById: Record<string, string>): string {
  const names = acceptedRoster(b)
    .map((id) => namesById[id]?.trim())
    .filter(Boolean);
  if (names.length) return names.join(" + ");
  return b.therapist_name?.trim() || "—";
}

/** Thérapeutes ayant accepté, dans un ordre positionnel reproductible. */
function acceptedRoster(b: RawBooking): string[] {
  return orderRoster(
    (b.booking_therapists ?? []).filter((r) => r.status === "accepted"),
  );
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body: ClosureRequest = await req.json();
    const {
      hotel_id,
      report_date,
      recipients,
      include_details = false,
      hide_commissions = false,
      include_unfinalized = false,
    } = body;

    if (!hotel_id || !report_date) {
      return new Response(
        JSON.stringify({ error: "hotel_id and report_date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cleanRecipients = (recipients ?? [])
      .map((r) => String(r).trim().toLowerCase())
      .filter((r) => EMAIL_RX.test(r));

    if (!cleanRecipients.length) {
      return new Response(
        JSON.stringify({ error: "At least one valid recipient email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: venue, error: venueError } = await supabase
      .from("hotels")
      .select(
        "id, name, currency, venue_type, out_of_hours_surcharge_percent, organizations ( name, commercial_name )",
      )
      .eq("id", hotel_id)
      .single();

    if (venueError || !venue) {
      console.error("[send-daily-closure-report] venue not found", venueError);
      return new Response(
        JSON.stringify({ error: "Venue not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [bookingsRes, ratesRes] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          `id, booking_id, booking_date, booking_time, client_first_name, client_last_name,
           client_type, room_number, therapist_id, therapist_name, duration, guest_count,
           total_price, is_out_of_hours, payment_method, payment_status, status,
           booking_treatments (
             therapist_id, treatment_id, is_addon, price_override,
             treatment_menus ( name, category, duration, price ),
             treatment_variants ( duration, price )
           ),
           booking_therapists ( therapist_id, status, assigned_at )`,
        )
        .eq("hotel_id", hotel_id)
        .eq("booking_date", report_date)
        .order("booking_time", { ascending: true }),
      supabase
        .from("therapist_venues")
        .select(
          "therapist_id, therapists ( id, first_name, last_name, rate_45, rate_60, rate_75, rate_90, rate_105, rate_120, rate_150, treatment_rates, treatment_rates_active )",
        )
        .eq("hotel_id", hotel_id),
    ]);

    if (bookingsRes.error) {
      console.error("[send-daily-closure-report] bookings query failed", bookingsRes.error);
      throw bookingsRes.error;
    }
    if (ratesRes.error) {
      console.error("[send-daily-closure-report] rates query failed", ratesRes.error);
      throw ratesRes.error;
    }

    const ratesMap: Record<string, TherapistRates | null> = {};
    // Barèmes spécifiques par soin. Le flag est honoré ici : une map inactive
    // n'atteint jamais le moteur de calcul.
    const treatmentRatesMap: Record<string, TreatmentRateMap | null> = {};
    // Noms des thérapeutes du lieu : c'est la seule source pour nommer le binôme
    // d'un duo (`bookings.therapist_name` ne connaît que le thérapeute principal,
    // et `booking_therapists` n'a pas de FK vers `therapists` à embarquer).
    const namesById: Record<string, string> = {};
    for (const row of ratesRes.data ?? []) {
      const t = (row as {
        therapists: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          rate_45: number | null;
          rate_60: number | null;
          rate_75: number | null;
          rate_90: number | null;
          rate_105: number | null;
          rate_120: number | null;
          rate_150: number | null;
          treatment_rates: TreatmentRateMap | null;
          treatment_rates_active: boolean | null;
        } | null;
      }).therapists;
      if (!t) continue;
      const rates: TherapistRates = {
        rate_45: t.rate_45,
        rate_60: t.rate_60,
        rate_75: t.rate_75,
        rate_90: t.rate_90,
        rate_105: t.rate_105,
        rate_120: t.rate_120,
        rate_150: t.rate_150,
      };
      const empty = rates.rate_60 == null && rates.rate_75 == null && rates.rate_90 == null;
      ratesMap[t.id] = empty ? null : rates;
      treatmentRatesMap[t.id] = t.treatment_rates_active ? t.treatment_rates ?? null : null;
      const fullName = `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim();
      if (fullName) namesById[t.id] = fullName;
    }

    // Émetteur affiché : l'organisation du lieu, repli sur la marque plateforme
    // quand le lieu n'est rattaché à aucune organisation.
    const org = (venue as { organizations: { name: string | null; commercial_name: string | null } | null })
      .organizations;
    const issuer = org?.commercial_name?.trim() || org?.name?.trim() || null;

    const bookings = (bookingsRes.data ?? []) as RawBooking[];
    const currency = (venue.currency as string) || "EUR";
    const money = (v: number) => fmtMoney(v, currency);
    const venueSurchargePercent = Number(venue.out_of_hours_surcharge_percent) || 0;
    let completed = 0;
    let cancelled = 0;
    let noShow = 0;
    let counted = 0;
    let unfinalized = 0;
    let unfinalizedRevenue = 0;
    let totalRevenue = 0;
    let bookingsWithoutTherapistRate = 0;

    const categoryMap = new Map<string, { count: number; revenue: number }>();
    const therapistMap = new Map<string, { name: string; count: number; revenue: number; earnings: number; hasRates: boolean }>();
    const paymentMap = new Map<string, { count: number; revenue: number; label: string }>();
    const clientTypeMap = new Map<ClientTypeValue, { count: number; revenue: number }>();
    const crossMap = new Map<
      string,
      { clientTypeLabel: string; paymentLabel: string; count: number; revenue: number }
    >();

    for (const b of bookings) {
      if (b.status === "completed") completed += 1;
      else if (b.status === "cancelled") cancelled += 1;
      else if (b.status === "no_show" || b.status === "noshow") noShow += 1;

      const isUnfinalized = UNFINALIZED_STATUSES.includes(b.status);
      if (isUnfinalized) {
        unfinalized += 1;
        unfinalizedRevenue += b.total_price ?? 0;
      }

      // Même périmètre que l'écran de clôture : les résas non finalisées ne
      // comptent que si l'expéditeur a explicitement demandé leur inclusion.
      if (b.status !== "completed" && !(include_unfinalized && isUnfinalized)) continue;

      counted += 1;
      const price = b.total_price ?? 0;
      totalRevenue += price;

      const surchargePercent = b.is_out_of_hours ? venueSurchargePercent : 0;

      // Un duo est réparti entre ses thérapeutes : chacun est crédité de son
      // propre soin et rémunéré sur ses propres tarifs. Un solo renvoie une part
      // unique, strictement identique au calcul précédent.
      const parts = splitBookingByTherapist({
        lines: (b.booking_treatments ?? []).map((bt) => ({
          therapist_id: bt.therapist_id,
          duration: lineDuration(bt),
          is_addon: bt.is_addon ?? false,
          price: resolveTreatmentPrice(bt),
          treatment_id: bt.treatment_id ?? null,
        })),
        orderedTherapistIds: acceptedRoster(b),
        guestCount: b.guest_count ?? 1,
        primaryTherapistId: b.therapist_id,
        totalPrice: price,
        bookingDuration: bookingDuration(b),
      });

      const categoryName = b.booking_treatments?.[0]?.treatment_menus?.category ?? "Autres";
      const cat = categoryMap.get(categoryName) ?? { count: 0, revenue: 0 };
      cat.count += 1;
      cat.revenue += price;
      categoryMap.set(categoryName, cat);

      const ctKey = normalizeClientType(b.client_type);
      const ct = clientTypeMap.get(ctKey) ?? { count: 0, revenue: 0 };
      ct.count += 1;
      ct.revenue += price;
      clientTypeMap.set(ctKey, ct);

      for (const part of parts) {
        const rates = part.therapistId ? ratesMap[part.therapistId] ?? null : null;
        const treatmentRates = part.therapistId
          ? treatmentRatesMap[part.therapistId] ?? null
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
        if (part.therapistId && !hasRates) bookingsWithoutTherapistRate += 1;

        // Le nom du lieu prime ; le snapshot `therapist_name` de la réservation
        // ne vaut que pour le thérapeute principal, jamais pour son binôme.
        const tName =
          (part.therapistId ? namesById[part.therapistId] : null) ||
          (part.therapistId && part.therapistId === b.therapist_id ? b.therapist_name : null) ||
          (part.therapistId ? null : b.therapist_name) ||
          "Non assigné";
        const tKey = part.therapistId ?? `name:${tName}`;
        const tStat = therapistMap.get(tKey);
        if (tStat) {
          tStat.count += 1;
          tStat.revenue += part.revenue;
          tStat.earnings += partEarnings;
          tStat.hasRates = tStat.hasRates && hasRates;
        } else {
          therapistMap.set(tKey, {
            name: tName,
            count: 1,
            revenue: part.revenue,
            earnings: partEarnings,
            hasRates,
          });
        }
      }

      // Les règlements sur place n'ont pas de payment_method : on retombe sur le
      // statut pour qu'ils apparaissent aussi dans la répartition.
      const methodKey = b.payment_method ?? `status:${b.payment_status ?? "unknown"}`;
      const methodLabel = paymentLabel(b.payment_method, b.payment_status);
      const mStat = paymentMap.get(methodKey) ?? { count: 0, revenue: 0, label: methodLabel };
      mStat.count += 1;
      mStat.revenue += price;
      paymentMap.set(methodKey, mStat);

      const crossKey = `${ctKey}|${methodKey}`;
      const cStat = crossMap.get(crossKey) ?? {
        clientTypeLabel: clientTypeLabel(ctKey, "fr"),
        paymentLabel: methodLabel,
        count: 0,
        revenue: 0,
      };
      cStat.count += 1;
      cStat.revenue += price;
      crossMap.set(crossKey, cStat);
    }

    const money2 = (v: number) => money(v);
    const withShare = <T extends { revenue: number }>(rows: T[]) => {
      const total = rows.reduce((sum, r) => sum + r.revenue, 0);
      return rows.map((r) => ({ ...r, share: total > 0 ? (r.revenue / total) * 100 : 0 }));
    };

    const categoryBuckets = withShare(
      Array.from(categoryMap.entries())
        .map(([name, v]) => ({ label: name, count: v.count, revenue: v.revenue }))
        .sort((x, y) => y.revenue - x.revenue),
    );

    const clientTypeTotal = Array.from(clientTypeMap.values()).reduce((sum, v) => sum + v.count, 0);
    const clientTypeBuckets = Array.from(clientTypeMap.entries())
      .sort((x, y) => y[1].revenue - x[1].revenue)
      .map(([key, v]) => ({
        label: clientTypeLabel(key, "fr"),
        count: v.count,
        revenue: v.revenue,
        share: clientTypeTotal ? (v.count / clientTypeTotal) * 100 : 0,
      }));

    const therapistBuckets = withShare(
      Array.from(therapistMap.values())
        .map((t) => ({ label: t.name, count: t.count, revenue: t.revenue }))
        .sort((x, y) => y.revenue - x.revenue),
    );

    const paymentBuckets = withShare(
      Array.from(paymentMap.values())
        .map((v) => ({ label: v.label, count: v.count, revenue: v.revenue }))
        .sort((x, y) => y.revenue - x.revenue),
    );

    const crossBuckets = withShare(
      Array.from(crossMap.values())
        .sort(
          (x, y) =>
            x.clientTypeLabel.localeCompare(y.clientTypeLabel, "fr") || y.revenue - x.revenue,
        )
        .map((v) => ({
          label: `${v.clientTypeLabel} · ${v.paymentLabel}`,
          count: v.count,
          revenue: v.revenue,
        })),
    );

    const toRows = (rows: Array<{ label: string; count: number; revenue: number; share: number }>) =>
      rows.map((r) => ({ label: r.label, count: r.count, share: r.share, amount: money2(r.revenue) }));

    const detailRows = include_details
      ? [...bookings]
          .sort((x, y) => x.booking_time.localeCompare(y.booking_time))
          .map((b) => ({
            bookingId: b.booking_id,
            time: (b.booking_time ?? "").slice(0, 5),
            client: `${b.client_first_name} ${b.client_last_name}`,
            room: roomNumberLabel(b),
            treatments:
              b.booking_treatments?.map((bt) => bt.treatment_menus?.name).filter(Boolean).join(", ") ||
              "—",
            therapist: therapistNames(b, namesById),
            price: b.total_price != null ? money(b.total_price) : "—",
            payment: paymentLabel(b.payment_method, b.payment_status),
            status: b.status,
            statusLabel: STATUS_LABELS[b.status] ?? b.status,
          }))
      : [];

    const completionPercent = `${bookings.length > 0 ? Math.round((counted / bookings.length) * 100) : 0} %`;

    const html = renderClosureEmailHtml({
      venueName: venue.name as string,
      issuer,
      dateLabel: fmtDateLong(report_date),
      totalRevenue: money(totalRevenue),
      averageTicket: money(counted > 0 ? totalRevenue / counted : 0),
      countedBookings: counted,
      totalBookings: bookings.length,
      cancelledBookings: cancelled,
      noShowBookings: noShow,
      completionPercent,
      includedUnfinalized: Boolean(include_unfinalized) && unfinalized > 0,
      unfinalizedCount: unfinalized,
      unfinalizedRevenue: money(unfinalizedRevenue),
      bookingsWithoutTherapistRate,
      hideCommissions: Boolean(hide_commissions),
      detail: detailRows,
      sections: [
        { title: "Par type de prestation", labelHeader: "Catégorie", rows: toRows(categoryBuckets) },
        { title: "Par type de client", labelHeader: "Type", rows: toRows(clientTypeBuckets) },
        {
          title: "Par thérapeute",
          labelHeader: "Thérapeute",
          // « Prestations réalisées » : sur un duo chacun des deux en compte une,
          // donc le total dépasse le nombre de réservations.
          countHeader: "Prestations réalisées",
          rows: toRows(therapistBuckets),
          hideShare: true,
        },
        { title: "Par moyen de paiement", labelHeader: "Moyen", rows: toRows(paymentBuckets) },
        {
          title: "Type de client × moyen de paiement",
          labelHeader: "Croisement",
          rows: toRows(crossBuckets),
        },
      ],
    });

    // Le sujet et le nom d'expéditeur ne nomment que le lieu et son organisation.
    const subject = issuer
      ? `[${issuer}] Clôture ${venue.name} — ${fmtDateLong(report_date)}`
      : `Clôture ${venue.name} — ${fmtDateLong(report_date)}`;
    const fromAddress =
      brand.emails.from.transactional.match(/<([^>]+)>/)?.[1] ??
      brand.emails.from.transactional;
    const from = `${issuer ?? (venue.name as string)} <${fromAddress}>`;

    const result = await sendEmail({
      to: cleanRecipients,
      subject,
      from,
      html,
    });

    if (result.error) {
      console.error("[send-daily-closure-report] sendEmail error", result.error);
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: result.id, recipients: cleanRecipients.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[send-daily-closure-report] unhandled error", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
