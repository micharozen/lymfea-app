import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { getBaseEmailTemplate, getEmailHeader } from "../_shared/email-template.ts";
import { computeTherapistEarnings, type TherapistRates } from "../_shared/therapistEarnings.ts";
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
             therapist_id, is_addon, price_override,
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
          "therapist_id, therapists ( id, first_name, last_name, rate_45, rate_60, rate_75, rate_90, rate_105, rate_120, rate_150 )",
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
      const fullName = `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim();
      if (fullName) namesById[t.id] = fullName;
    }

    // Émetteur affiché : l'organisation du lieu, repli sur la marque plateforme
    // quand le lieu n'est rattaché à aucune organisation.
    const org = (venue as { organizations: { name: string | null; commercial_name: string | null } | null })
      .organizations;
    const issuer = org?.commercial_name?.trim() || org?.name?.trim() || brand.name;

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
      else if (b.status === "no_show") noShow += 1;

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
        const earnings =
          part.therapistId && part.duration > 0
            ? computeTherapistEarnings(rates, part.duration, { surchargePercent })
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

    const headline = `${counted} prestation${counted > 1 ? "s" : ""} · ${money(totalRevenue)}`;

    const revenueCards = [
      [include_unfinalized ? "Prestations comptées" : "Prestations complétées", String(counted)],
      ["Chiffre d'affaires", money(totalRevenue)],
    ];

    const lossCards = [
      ["Annulées", String(cancelled)],
      ["No show", String(noShow)],
      ["Nombre total de réservations", String(bookings.length)],
    ];

    const renderCardsRow = (cards: string[][], bg = "#ffffff") =>
      cards.length
        ? `<tr><td style="padding:8px 30px 0;">
        <!-- table-layout:fixed : sans lui, un libellé long élargit sa carte au
             détriment des autres et la rangée n'est plus régulière. -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;">
          <tr>
            ${cards
              .map(
                ([label, value]) => `
              <td width="${Math.floor(100 / cards.length)}%" style="padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:${bg};text-align:center;vertical-align:top;">
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(label)}</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:600;color:#111827;">${escapeHtml(value)}</p>
              </td>`,
              )
              .join('<td width="8"></td>')}
          </tr>
        </table>
      </td></tr>`
        : "";

    // Le destinataire doit savoir que des prestations non encore terminées sont
    // comptées : sans cette mention, le CA n'est pas rapprochable de la base.
    const unfinalizedBanner =
      include_unfinalized && unfinalized > 0
        ? `<tr><td style="padding:0 30px 12px;">
          <p style="margin:0;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;color:#1e40af;">
            ℹ ${unfinalized} réservation${unfinalized > 1 ? "s" : ""} non encore finalisée${unfinalized > 1 ? "s" : ""} (${money(unfinalizedRevenue)}) ${unfinalized > 1 ? "sont comptées" : "est comptée"} dans ce rapport.
          </p>
        </td></tr>`
        : "";

    const warningBanner =
      !hide_commissions && bookingsWithoutTherapistRate > 0
        ? `<tr><td style="padding:0 30px 12px;">
          <p style="margin:0;padding:10px 14px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:13px;color:#92400e;">
            ⚠ ${bookingsWithoutTherapistRate} prestation${bookingsWithoutTherapistRate > 1 ? "s" : ""} sans tarif thérapeute défini — part thérapeute calculée à 0 sur ces lignes.
          </p>
        </td></tr>`
        : "";

    const buildTable = (title: string, headers: string[], rows: string[][]) => {
      if (!rows.length) return "";
      const head = headers
        .map(
          (h, i) =>
            `<th style="padding:6px 10px;text-align:${i === headers.length - 1 ? "right" : "left"};font-size:11px;color:#6b7280;text-transform:uppercase;">${escapeHtml(h)}</th>`,
        )
        .join("");
      const body = rows
        .map(
          (cells) =>
            `<tr>${cells
              .map(
                (c, i) =>
                  `<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:${i === cells.length - 1 ? "right" : "left"};${i === cells.length - 1 ? "font-weight:500;" : ""}">${c}</td>`,
              )
              .join("")}</tr>`,
        )
        .join("");
      const heading = title
        ? `<h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">${escapeHtml(title)}</h3>`
        : "";
      return `${heading}
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead><tr style="background:#f9fafb;">${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>`;
    };

    const categoryRows = Array.from(categoryMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, v]) => [escapeHtml(name), String(v.count), money(v.revenue)]);

    const clientTypeTotal = Array.from(clientTypeMap.values()).reduce((sum, v) => sum + v.count, 0);
    const clientTypeBuckets = Array.from(clientTypeMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([key, v]) => ({
        key,
        count: v.count,
        revenue: v.revenue,
        sharePercent: clientTypeTotal ? (v.count / clientTypeTotal) * 100 : 0,
      }));
    const clientTypeRows = clientTypeBuckets.map((b) => [
      escapeHtml(clientTypeLabel(b.key, "fr")),
      String(b.count),
      fmtPercent(b.sharePercent),
      money(b.revenue),
    ]);

    const therapistRows = Array.from(therapistMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((t) => [escapeHtml(t.name), String(t.count), money(t.revenue)]);

    const paymentRows = Array.from(paymentMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((v) => [escapeHtml(v.label), String(v.count), money(v.revenue)]);

    const crossRows = Array.from(crossMap.values())
      .sort(
        (a, b) =>
          a.clientTypeLabel.localeCompare(b.clientTypeLabel, "fr") || b.revenue - a.revenue,
      )
      .map((v) => [
        escapeHtml(v.clientTypeLabel),
        escapeHtml(v.paymentLabel),
        String(v.count),
        money(v.revenue),
      ]);

    const sectionsHtml = `
      <tr><td style="padding:20px 30px 0;">
        ${buildTable("Par type de prestation", ["Catégorie", "Prestations", "CA"], categoryRows)}
        ${buildTable("Par type de client", ["Type", "Prestations", "Part", "CA"], clientTypeRows)}
        ${buildTable(
          "Par thérapeute",
          // « Prestations réalisées » et non « Prestations » : sur un duo, chacun
          // des deux thérapeutes en compte une, donc le total dépasse le nombre
          // de réservations.
          ["Thérapeute", "Prestations réalisées", "CA"],
          therapistRows,
        )}
        ${buildTable("Par moyen de paiement", ["Moyen", "Nombre", "Montant"], paymentRows)}
        ${buildTable("Type de client × moyen de paiement", ["Type de client", "Moyen de paiement", "Prestations", "CA"], crossRows)}
      </td></tr>
    `;

    let detailsHtml = "";
    if (include_details && bookings.length) {
      const detailRows = [...bookings]
        .sort((a, b) => a.booking_time.localeCompare(b.booking_time))
        .map((b) => {
          const treatments =
            b.booking_treatments?.map((bt) => bt.treatment_menus?.name).filter(Boolean).join(", ") || "—";
          return `
            <tr>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">#${b.booking_id}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(`${b.client_first_name} ${b.client_last_name}`)}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(roomNumberLabel(b))}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(treatments)}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(therapistNames(b, namesById))}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;text-align:right;">${b.total_price != null ? money(b.total_price) : "—"}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(paymentLabel(b.payment_method, b.payment_status))}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(STATUS_LABELS[b.status] ?? b.status)}</td>
            </tr>`;
        })
        .join("");

      detailsHtml = `
        <tr><td style="padding:20px 30px 0;">
          <h3 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Détail des prestations</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead><tr style="background:#f9fafb;">
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">N°</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Client</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Chambre</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Prestation</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Thérapeute</th>
              <th style="padding:6px 8px;text-align:right;font-size:10px;color:#6b7280;text-transform:uppercase;">Prix</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Paiement</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Statut</th>
            </tr></thead>
            <tbody>${detailRows}</tbody>
          </table>
        </td></tr>
      `;
    }

    const headerContent = `
      ${getEmailHeader(`Clôture quotidienne`, headline, "#111827")}
      <tr><td style="padding:0 30px;text-align:center;">
        <p style="margin:0;font-size:16px;font-weight:600;color:#111827;">${escapeHtml(venue.name as string)}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(issuer)} · ${escapeHtml(fmtDateLong(report_date))}</p>
      </td></tr>
      ${unfinalizedBanner}
${warningBanner}
      ${renderCardsRow(revenueCards)}
      ${renderCardsRow(lossCards)}
      ${detailsHtml}
      ${sectionsHtml}
    `;

    const html = getBaseEmailTemplate(headerContent);

    const subject = `[${issuer}] Clôture ${venue.name} — ${fmtDateLong(report_date)}`;

    const result = await sendEmail({
      to: cleanRecipients,
      subject,
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
