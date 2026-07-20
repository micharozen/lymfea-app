import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { getBaseEmailTemplate, getEmailHeader } from "../_shared/email-template.ts";
import { computeTherapistEarnings, type TherapistRates } from "../_shared/therapistEarnings.ts";
import { normalizeClientType, clientTypeLabel, type BookingClientType } from "../_shared/client-type.ts";

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
}

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
  total_price: number | null;
  payment_method: string | null;
  status: string;
  booking_treatments?: Array<{
    treatment_menus: { name: string; category: string | null; duration: number | null } | null;
  }> | null;
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

function bookingDuration(booking: RawBooking): number {
  if (booking.duration && booking.duration > 0) return booking.duration;
  return (booking.booking_treatments ?? []).reduce(
    (sum, bt) => sum + (bt.treatment_menus?.duration ?? 0),
    0,
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
      .select("id, name, currency, hotel_commission, venue_type")
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
           client_type, room_number, therapist_id, therapist_name, duration,
           total_price, payment_method, status,
           booking_treatments ( treatment_menus ( name, category, duration ) )`,
        )
        .eq("hotel_id", hotel_id)
        .eq("booking_date", report_date)
        .order("booking_time", { ascending: true }),
      supabase
        .from("therapist_venues")
        .select("therapist_id, therapists ( id, rate_60, rate_75, rate_90 )")
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
    for (const row of ratesRes.data ?? []) {
      const t = (row as { therapists: { id: string; rate_60: number | null; rate_75: number | null; rate_90: number | null } | null }).therapists;
      if (!t) continue;
      const rates: TherapistRates = { rate_60: t.rate_60, rate_75: t.rate_75, rate_90: t.rate_90 };
      const empty = rates.rate_60 == null && rates.rate_75 == null && rates.rate_90 == null;
      ratesMap[t.id] = empty ? null : rates;
    }

    const bookings = (bookingsRes.data ?? []) as RawBooking[];
    const currency = (venue.currency as string) || "EUR";
    const money = (v: number) => fmtMoney(v, currency);
    const venueRate = Number(venue.hotel_commission ?? 0) / 100;

    let completed = 0;
    let confirmed = 0;
    let cancelled = 0;
    let noShow = 0;
    let pending = 0;
    let totalRevenue = 0;
    let totalVenueShare = 0;
    let totalTherapistShare = 0;
    let bookingsWithoutTherapistRate = 0;

    const categoryMap = new Map<string, { count: number; revenue: number }>();
    const therapistMap = new Map<string, { name: string; count: number; revenue: number; earnings: number; hasRates: boolean }>();
    const paymentMap = new Map<string, { count: number; revenue: number }>();
    const clientTypeMap = new Map<ClientTypeValue, { count: number; revenue: number }>();

    for (const b of bookings) {
      if (b.status === "completed") completed += 1;
      else if (b.status === "confirmed") confirmed += 1;
      else if (b.status === "cancelled") cancelled += 1;
      else if (b.status === "no_show") noShow += 1;
      else if (b.status === "pending") pending += 1;

      if (b.status !== "completed") continue;

      const price = b.total_price ?? 0;
      totalRevenue += price;
      totalVenueShare += price * venueRate;

      const rates = b.therapist_id ? ratesMap[b.therapist_id] ?? null : null;
      const duration = bookingDuration(b);
      const earnings = b.therapist_id && duration > 0 ? computeTherapistEarnings(rates, duration) : null;
      const therapistEarnings = earnings ?? 0;
      const hasRates = earnings !== null;
      if (b.therapist_id && !hasRates) bookingsWithoutTherapistRate += 1;
      totalTherapistShare += therapistEarnings;

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

      const tName = b.therapist_name ?? "Non assigné";
      const tKey = b.therapist_id ?? `name:${tName}`;
      const tStat = therapistMap.get(tKey);
      if (tStat) {
        tStat.count += 1;
        tStat.revenue += price;
        tStat.earnings += therapistEarnings;
        tStat.hasRates = tStat.hasRates && hasRates;
      } else {
        therapistMap.set(tKey, { name: tName, count: 1, revenue: price, earnings: therapistEarnings, hasRates });
      }

      const method = b.payment_method ?? "unknown";
      const mStat = paymentMap.get(method) ?? { count: 0, revenue: 0 };
      mStat.count += 1;
      mStat.revenue += price;
      paymentMap.set(method, mStat);
    }

    const totalPlatformShare = totalRevenue - totalVenueShare - totalTherapistShare;
    const headline = `${completed} prestation${completed > 1 ? "s" : ""} · ${money(totalRevenue)}`;

    const revenueCards = [
      ["Prestations complétées", String(completed)],
      ["Chiffre d'affaires", money(totalRevenue)],
      ["Confirmées (à venir)", String(confirmed)],
      ["En attente", String(pending)],
    ];

    const commissionCards = hide_commissions
      ? []
      : [
          ["Part lieu", money(totalVenueShare)],
          ["Part thérapeute", money(totalTherapistShare)],
          ["Part plateforme", money(totalPlatformShare)],
        ];

    const lossCards = [
      ["Annulées", String(cancelled)],
      ["No-show", String(noShow)],
      ["Total bookings", String(bookings.length)],
    ];

    const renderCardsRow = (cards: string[][], bg = "#ffffff") =>
      cards.length
        ? `<tr><td style="padding:8px 30px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            ${cards
              .map(
                ([label, value]) => `
              <td style="padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:${bg};text-align:center;vertical-align:top;">
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(label)}</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:600;color:#111827;">${escapeHtml(value)}</p>
              </td>`,
              )
              .join('<td width="8"></td>')}
          </tr>
        </table>
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
      return `<h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">${escapeHtml(title)}</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead><tr style="background:#f9fafb;">${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>`;
    };

    const categoryRows = Array.from(categoryMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, v]) => [escapeHtml(name), String(v.count), money(v.revenue)]);

    const clientTypeRows = Array.from(clientTypeMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([k, v]) => [escapeHtml(clientTypeLabel(k, "fr")), String(v.count), money(v.revenue)]);

    const therapistHeaders = hide_commissions
      ? ["Thérapeute", "Prestations", "CA"]
      : ["Thérapeute", "Prestations", "CA", "Part thér."];
    const therapistRows = Array.from(therapistMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((t) => {
        const base = [escapeHtml(t.name), String(t.count), money(t.revenue)];
        if (hide_commissions) return base;
        return [...base, t.hasRates ? money(t.earnings) : `<span style="color:#dc2626">—</span>`];
      });

    const paymentRows = Array.from(paymentMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([method, v]) => [
        escapeHtml(PAYMENT_METHOD_LABELS[method] ?? method),
        String(v.count),
        money(v.revenue),
      ]);

    const sectionsHtml = `
      <tr><td style="padding:20px 30px 0;">
        ${buildTable("Par type de prestation", ["Catégorie", "Prestations", "CA"], categoryRows)}
        ${buildTable("Par type de client", ["Type", "Prestations", "CA"], clientTypeRows)}
        ${buildTable("Par thérapeute", therapistHeaders, therapistRows)}
        ${buildTable("Par moyen de paiement", ["Moyen", "Nombre", "Montant"], paymentRows)}
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
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(b.booking_time.slice(0, 5))}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">#${b.booking_id}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(`${b.client_first_name} ${b.client_last_name}`)}${b.room_number ? ` <span style="color:#6b7280">· ch. ${escapeHtml(b.room_number)}</span>` : ""}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(treatments)}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(b.therapist_name ?? "—")}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;text-align:right;">${b.total_price != null ? money(b.total_price) : "—"}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(b.payment_method ? (PAYMENT_METHOD_LABELS[b.payment_method] ?? b.payment_method) : "—")}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(STATUS_LABELS[b.status] ?? b.status)}</td>
            </tr>`;
        })
        .join("");

      detailsHtml = `
        <tr><td style="padding:20px 30px 0;">
          <h3 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Détail des prestations</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead><tr style="background:#f9fafb;">
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Heure</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">N°</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Client</th>
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
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(fmtDateLong(report_date))}</p>
      </td></tr>
      ${warningBanner}
      ${renderCardsRow(revenueCards)}
      ${renderCardsRow(commissionCards, "#f9fafb")}
      ${renderCardsRow(lossCards)}
      ${sectionsHtml}
      ${detailsHtml}
    `;

    const html = getBaseEmailTemplate(headerContent);

    const subject = `[${brand.name}] Clôture ${venue.name} — ${fmtDateLong(report_date)}`;

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
