import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { getBaseEmailTemplate, getEmailHeader } from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClosureRequest {
  hotel_id: string;
  report_date: string; // YYYY-MM-DD
  recipients: string[];
  include_details?: boolean;
}

interface RawBooking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  room_number: string | null;
  therapist_name: string | null;
  total_price: number | null;
  payment_method: string | null;
  status: string;
  booking_treatments?: Array<{
    treatment_menus: { name: string; category: string | null } | null;
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
  card: "Carte",
  cash: "Espèces",
  room_charge: "Note de chambre",
  bank_transfer: "Virement",
  payment_link: "Lien de paiement",
  tap_to_pay: "Tap to Pay",
  free: "Offert",
};

const COMPLETED_STATUSES = new Set(["completed", "confirmed"]);

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
    const { hotel_id, report_date, recipients, include_details = false } = body;

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
      .select("id, name, currency, hotel_commission, therapist_commission, venue_type")
      .eq("id", hotel_id)
      .single();

    if (venueError || !venue) {
      console.error("[send-daily-closure-report] venue not found", venueError);
      return new Response(
        JSON.stringify({ error: "Venue not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: rawBookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        `id, booking_id, booking_date, booking_time, client_first_name, client_last_name,
         room_number, therapist_name, total_price, payment_method, status,
         booking_treatments ( treatment_menus ( name, category ) )`,
      )
      .eq("hotel_id", hotel_id)
      .eq("booking_date", report_date)
      .order("booking_time", { ascending: true });

    if (bookingsError) {
      console.error("[send-daily-closure-report] bookings query failed", bookingsError);
      throw bookingsError;
    }

    const bookings = (rawBookings ?? []) as RawBooking[];
    const currency = (venue.currency as string) || "EUR";
    const money = (v: number) => fmtMoney(v, currency);
    const therapistRate = Number(venue.therapist_commission ?? 0) / 100;
    const venueRate = Number(venue.hotel_commission ?? 0) / 100;

    let completed = 0;
    let cancelled = 0;
    let noShow = 0;
    let pending = 0;
    let totalRevenue = 0;
    let totalVenueShare = 0;
    let totalTherapistShare = 0;
    let totalPlatformShare = 0;

    const categoryMap = new Map<string, { count: number; revenue: number }>();
    const therapistMap = new Map<string, { count: number; revenue: number }>();
    const paymentMap = new Map<string, { count: number; revenue: number }>();
    const clientType = {
      internal: { count: 0, revenue: 0 },
      external: { count: 0, revenue: 0 },
    };

    for (const b of bookings) {
      const price = b.total_price ?? 0;

      if (b.status === "completed") completed += 1;
      else if (b.status === "cancelled") cancelled += 1;
      else if (b.status === "no_show") noShow += 1;
      else if (b.status === "pending") pending += 1;

      if (!COMPLETED_STATUSES.has(b.status)) continue;

      totalRevenue += price;
      totalVenueShare += price * venueRate;
      totalTherapistShare += price * therapistRate;
      totalPlatformShare += price * (1 - venueRate - therapistRate);

      const categoryName =
        b.booking_treatments?.[0]?.treatment_menus?.category ?? "Autres";
      const cat = categoryMap.get(categoryName) ?? { count: 0, revenue: 0 };
      cat.count += 1;
      cat.revenue += price;
      categoryMap.set(categoryName, cat);

      const tName = b.therapist_name ?? "Non assigné";
      const tStat = therapistMap.get(tName) ?? { count: 0, revenue: 0 };
      tStat.count += 1;
      tStat.revenue += price;
      therapistMap.set(tName, tStat);

      const method = b.payment_method ?? "unknown";
      const mStat = paymentMap.get(method) ?? { count: 0, revenue: 0 };
      mStat.count += 1;
      mStat.revenue += price;
      paymentMap.set(method, mStat);

      const target = b.room_number ? clientType.internal : clientType.external;
      target.count += 1;
      target.revenue += price;
    }

    const headline = `${completed} prestation${completed > 1 ? "s" : ""} · ${money(totalRevenue)}`;

    const summaryRows = [
      ["Prestations réalisées", String(completed)],
      ["Chiffre d'affaires", money(totalRevenue)],
      ["Part lieu", money(totalVenueShare)],
      ["Part thérapeute", money(totalTherapistShare)],
      ["En attente", String(pending)],
      ["Annulées", String(cancelled)],
      ["No-show", String(noShow)],
      ["Total bookings", String(bookings.length)],
    ];

    const summaryHtml = `
      <tr><td style="padding:8px 30px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            ${summaryRows
              .slice(0, 4)
              .map(
                ([label, value]) => `
              <td style="padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;width:25%;text-align:center;vertical-align:top;">
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(label)}</p>
                <p style="margin:6px 0 0;font-size:18px;font-weight:600;color:#111827;">${escapeHtml(value)}</p>
              </td>
            `,
              )
              .join("")}
          </tr>
          <tr><td colspan="4" style="height:8px;"></td></tr>
          <tr>
            ${summaryRows
              .slice(4)
              .map(
                ([label, value]) => `
              <td style="padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:#ffffff;width:25%;text-align:center;vertical-align:top;">
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(label)}</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:600;color:#111827;">${escapeHtml(value)}</p>
              </td>
            `,
              )
              .join("")}
          </tr>
        </table>
      </td></tr>
    `;

    const categoryRows = Array.from(categoryMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(
        ([name, v]) => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escapeHtml(name)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;">${v.count}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;font-weight:500;">${money(v.revenue)}</td>
          </tr>`,
      )
      .join("");

    const therapistRows = Array.from(therapistMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(
        ([name, v]) => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escapeHtml(name)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;">${v.count}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;font-weight:500;">${money(v.revenue)}</td>
          </tr>`,
      )
      .join("");

    const paymentRows = Array.from(paymentMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(
        ([method, v]) => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escapeHtml(PAYMENT_METHOD_LABELS[method] ?? method)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;">${v.count}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;font-weight:500;">${money(v.revenue)}</td>
          </tr>`,
      )
      .join("");

    const internalLabel = venue.venue_type === "hotel" ? "Résidents (avec n° chambre)" : "Clients sur place";

    const sectionsHtml = `
      <tr><td style="padding:0 30px;">
        <h3 style="margin:8px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Par type de prestation</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Catégorie</th>
            <th style="padding:6px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">Préstations</th>
            <th style="padding:6px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">CA</th>
          </tr></thead>
          <tbody>${categoryRows || `<tr><td colspan="3" style="padding:8px;color:#9ca3af;font-size:13px;">Aucune prestation</td></tr>`}</tbody>
        </table>

        <h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Par type de client</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Type</th>
            <th style="padding:6px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">Préstations</th>
            <th style="padding:6px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">CA</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escapeHtml(internalLabel)}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;">${clientType.internal.count}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;font-weight:500;">${money(clientType.internal.revenue)}</td>
            </tr>
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;">Clients externes</td>
              <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;">${clientType.external.count}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;font-weight:500;">${money(clientType.external.revenue)}</td>
            </tr>
          </tbody>
        </table>

        ${
          therapistRows
            ? `
        <h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Par thérapeute</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Thérapeute</th>
            <th style="padding:6px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">Préstations</th>
            <th style="padding:6px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">CA</th>
          </tr></thead>
          <tbody>${therapistRows}</tbody>
        </table>`
            : ""
        }

        ${
          paymentRows
            ? `
        <h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Par moyen de paiement</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Moyen</th>
            <th style="padding:6px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">Nombre</th>
            <th style="padding:6px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">Montant</th>
          </tr></thead>
          <tbody>${paymentRows}</tbody>
        </table>`
            : ""
        }
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
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(`${b.client_first_name} ${b.client_last_name}`)}${b.room_number ? ` <span style=\"color:#6b7280\">· ch. ${escapeHtml(b.room_number)}</span>` : ""}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(treatments)}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(b.therapist_name ?? "—")}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;text-align:right;">${b.total_price != null ? money(b.total_price) : "—"}</td>
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
      ${summaryHtml}
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
