import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { brand } from "../_shared/brand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeHtml = (unsafe: string | null | undefined): string => {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

interface RequestBody {
  mode?: "auto" | "manual";
  hotel_id?: string;
  period_start?: string;
  period_end?: string;
}

interface BillingProfile {
  company_name?: string | null;
  legal_form?: string | null;
  siret?: string | null;
  siren?: string | null;
  tva_number?: string | null;
  vat_exempt?: boolean | null;
  billing_address?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
  billing_country?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  iban?: string | null;
  bic?: string | null;
  bank_name?: string | null;
}

interface Hotel {
  id: string;
  name: string;
  vat: number | null;
  address: string | null;
  city: string | null;
}

interface GeneratedInvoiceData {
  hotel: Hotel;
  billingProfile: BillingProfile;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  periodStart: Date;
  periodEnd: Date;
  amountHt: number;
  vatRate: number;
  vatAmount: number;
  amountTtc: number;
  bookingsCount: number;
}

const formatDateFr = (d: Date): string =>
  d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

const formatAmount = (n: number): string =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const formatPeriodFr = (start: Date, end: Date): string =>
  `${start.toLocaleDateString("fr-FR")} → ${end.toLocaleDateString("fr-FR")}`;

const generateInvoiceHTML = (data: GeneratedInvoiceData): string => {
  const {
    hotel,
    billingProfile,
    invoiceNumber,
    issueDate,
    dueDate,
    periodStart,
    periodEnd,
    amountHt,
    vatRate,
    vatAmount,
    amountTtc,
    bookingsCount,
  } = data;

  const legal = brand.legal;

  const issuerName = legal.companyName;
  const issuerAddressHtml = escapeHtml(legal.address).replace(/, /g, "<br>");

  const clientName = billingProfile.company_name || hotel.name;
  const clientAddressHtml = [
    billingProfile.billing_address,
    [billingProfile.billing_postal_code, billingProfile.billing_city].filter(Boolean).join(" "),
    billingProfile.billing_country,
  ]
    .filter(Boolean)
    .map((line) => escapeHtml(line as string))
    .join("<br>");

  const clientLegalLines: string[] = [];
  if (billingProfile.siret) clientLegalLines.push(`SIRET ${escapeHtml(billingProfile.siret)}`);
  if (billingProfile.siren && !billingProfile.siret)
    clientLegalLines.push(`SIREN ${escapeHtml(billingProfile.siren)}`);
  if (billingProfile.tva_number && !billingProfile.vat_exempt)
    clientLegalLines.push(`N° TVA ${escapeHtml(billingProfile.tva_number)}`);

  const lineDescription = `Prestations réalisées — ${hotel.name} — ${formatPeriodFr(periodStart, periodEnd)} (${bookingsCount} prestation${bookingsCount > 1 ? "s" : ""})`;

  const vatNotice = billingProfile.vat_exempt
    ? `<div class="vat-notice">TVA non applicable, art. 293 B du CGI</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Facture ${escapeHtml(invoiceNumber)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 48px;
    color: #1a1a1a;
    background: #fff;
    font-size: 13px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .document { max-width: 720px; margin: 0 auto; }
  .top { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 40px; }
  .issuer-block { flex: 1; }
  .brand-name { font-size: 16px; font-weight: 700; margin-bottom: 16px; letter-spacing: 0.5px; }
  .doc-type { font-size: 22px; font-weight: 600; color: #666; margin-bottom: 14px; }
  .meta-row { display: flex; gap: 8px; font-size: 12px; margin-bottom: 4px; }
  .meta-row .label { font-weight: 600; min-width: 110px; color: #555; }
  .meta-row .value { color: #1a1a1a; }
  .parties { display: flex; flex-direction: column; gap: 14px; align-items: flex-end; text-align: right; flex: 1; font-size: 12px; }
  .party-label { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .party-name { font-weight: 600; font-size: 13px; color: #1a1a1a; }
  .party-lines { color: #555; font-size: 12px; line-height: 1.6; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 24px; table-layout: fixed; }
  table.items col.col-desc { width: auto; }
  table.items col.col-qty { width: 48px; }
  table.items col.col-unit { width: 100px; }
  table.items col.col-vat { width: 70px; }
  table.items col.col-ht { width: 100px; }
  table.items col.col-ttc { width: 110px; }
  table.items thead th {
    font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase;
    letter-spacing: 0.5px; padding: 10px 6px; border-bottom: 1px solid #e5e5e5; text-align: right;
    white-space: nowrap;
  }
  table.items thead th:first-child { text-align: left; }
  table.items tbody td {
    padding: 14px 6px; border-bottom: 1px solid #f2f2f2; text-align: right; font-size: 13px;
    white-space: nowrap;
  }
  table.items tbody td:first-child { text-align: left; white-space: normal; word-break: break-word; }
  .summary { display: flex; gap: 40px; margin-top: 24px; }
  .tva-details { flex: 1; }
  .tva-title, .reca-title { font-size: 13px; font-weight: 600; color: #555; margin-bottom: 10px; }
  .tva-grid { display: grid; grid-template-columns: auto auto auto; gap: 6px 24px; font-size: 12px; }
  .tva-grid .head { font-weight: 600; color: #888; font-size: 11px; text-transform: uppercase; }
  .reca { flex: 1; }
  .reca-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .reca-row.total {
    border-top: 1px solid #1a1a1a; margin-top: 6px; padding-top: 10px;
    font-weight: 600; font-size: 15px;
  }
  .vat-notice {
    margin-top: 16px; padding: 10px 14px; background: #fafafa; border-radius: 6px;
    font-size: 12px; color: #555; font-style: italic;
  }
  .penalties { margin-top: 30px; font-size: 10px; color: #888; line-height: 1.5; }
  .footer {
    margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e5e5;
    text-align: center; font-size: 10px; color: #888;
  }
</style>
</head>
<body>
<div class="document">
  <div class="top">
    <div class="issuer-block">
      <div class="brand-name">${escapeHtml(issuerName)}</div>
      <div class="doc-type">Facture</div>
      <div class="meta-row"><span class="label">Numéro</span><span class="value">${escapeHtml(invoiceNumber)}</span></div>
      <div class="meta-row"><span class="label">Date d'émission</span><span class="value">${formatDateFr(issueDate)}</span></div>
      <div class="meta-row"><span class="label">Date d'échéance</span><span class="value">${formatDateFr(dueDate)}</span></div>
      <div class="meta-row"><span class="label">Période</span><span class="value">${escapeHtml(formatPeriodFr(periodStart, periodEnd))}</span></div>
      <div class="meta-row"><span class="label">Lieu</span><span class="value">${escapeHtml(hotel.name)}</span></div>
    </div>
    <div class="parties">
      <div class="party">
        <div class="party-label">Émetteur</div>
        <div class="party-name">${escapeHtml(issuerName)}</div>
        <div class="party-lines">
          ${issuerAddressHtml}<br>
          SIREN ${escapeHtml(legal.siren)}<br>
          N° TVA ${escapeHtml(legal.vatNumber)}
        </div>
      </div>
      <div class="party">
        <div class="party-label">Client</div>
        <div class="party-name">${escapeHtml(clientName)}</div>
        <div class="party-lines">
          ${clientAddressHtml || ""}
          ${clientLegalLines.length ? "<br>" + clientLegalLines.join("<br>") : ""}
          ${billingProfile.contact_email ? `<br>${escapeHtml(billingProfile.contact_email)}` : ""}
        </div>
      </div>
    </div>
  </div>

  <table class="items">
    <colgroup>
      <col class="col-desc">
      <col class="col-qty">
      <col class="col-unit">
      <col class="col-vat">
      <col class="col-ht">
      <col class="col-ttc">
    </colgroup>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qté</th>
        <th>Prix u. HT</th>
        <th>TVA (%)</th>
        <th>Total HT</th>
        <th>Total TTC</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${escapeHtml(lineDescription)}</td>
        <td>1</td>
        <td>${formatAmount(amountHt)}</td>
        <td>${billingProfile.vat_exempt ? "—" : `${vatRate}%`}</td>
        <td>${formatAmount(amountHt)}</td>
        <td>${formatAmount(amountTtc)}</td>
      </tr>
    </tbody>
  </table>

  <div class="summary">
    <div class="tva-details">
      <div class="tva-title">Détails TVA</div>
      <div class="tva-grid">
        <div class="head">Taux</div><div class="head">Montant TVA</div><div class="head">Base HT</div>
        <div>${billingProfile.vat_exempt ? "—" : `${vatRate}%`}</div>
        <div>${formatAmount(vatAmount)}</div>
        <div>${formatAmount(amountHt)}</div>
      </div>
    </div>
    <div class="reca">
      <div class="reca-title">Récapitulatif</div>
      <div class="reca-row"><span>Total HT</span><span>${formatAmount(amountHt)}</span></div>
      <div class="reca-row"><span>Total TVA</span><span>${formatAmount(vatAmount)}</span></div>
      <div class="reca-row total"><span>Total TTC</span><span>${formatAmount(amountTtc)}</span></div>
    </div>
  </div>

  ${vatNotice}

  <div class="penalties">
    Pénalités de retard : trois fois le taux annuel d'intérêt légal en vigueur calculé depuis la date d'échéance jusqu'à complet paiement du prix.<br>
    Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.
  </div>

  <div class="footer">
    ${escapeHtml(legal.companyName)} · ${escapeHtml(legal.companyType)} au capital de ${escapeHtml(legal.capital)} · N° SIREN ${escapeHtml(legal.siren)} · N° TVA ${escapeHtml(legal.vatNumber)}<br>
    Généré par ${escapeHtml(brand.name)}
  </div>
</div>
</body>
</html>`;
};

// ============================================================================
// Business logic
// ============================================================================

const previousMonthRange = (): { start: string; end: string } => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

const nextInvoiceNumber = async (): Promise<string> => {
  const { data, error } = await supabaseAdmin.rpc("next_invoice_number");
  if (error) throw error;
  return data as string;
};

const generateForHotel = async (
  hotel: Hotel,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ success: boolean; skipped?: boolean; reason?: string; invoiceId?: string }> => {
  const startStr = periodStart.toISOString().slice(0, 10);
  const endStr = periodEnd.toISOString().slice(0, 10);

  const { data: bookings, error: bookingsError } = await supabaseAdmin
    .from("bookings")
    .select("id, total_price, status, payment_status, booking_date")
    .eq("hotel_id", hotel.id)
    .gte("booking_date", startStr)
    .lte("booking_date", endStr)
    .in("status", ["completed"])
    .in("payment_status", ["paid", "charged_to_room", "offert"]);

  if (bookingsError) throw bookingsError;

  const eligibleBookings = bookings ?? [];
  if (eligibleBookings.length === 0) {
    return { success: true, skipped: true, reason: "no_bookings" };
  }

  const bookingIds = eligibleBookings.map((b) => b.id);
  const amountTtcRaw = eligibleBookings.reduce(
    (sum, b) => sum + Number(b.total_price ?? 0),
    0,
  );
  const amountTtc = Math.round(amountTtcRaw * 100) / 100;

  if (amountTtc <= 0) {
    return { success: true, skipped: true, reason: "zero_amount" };
  }

  const { data: billingProfile } = await supabaseAdmin
    .from("billing_profiles")
    .select("*")
    .eq("owner_type", "hotel")
    .eq("owner_id", hotel.id)
    .maybeSingle();

  const profile: BillingProfile = billingProfile ?? {};
  // Les montants des bookings sont TTC — on extrait la TVA (20%) plutôt que de l'ajouter.
  const vatRate = 20;
  const amountHt = Math.round((amountTtc / (1 + vatRate / 100)) * 100) / 100;
  const vatAmount = Math.round((amountTtc - amountHt) * 100) / 100;

  const issueDate = new Date();
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + 30);

  const invoiceNumber = await nextInvoiceNumber();

  const invoiceHTML = generateInvoiceHTML({
    hotel,
    billingProfile: profile,
    invoiceNumber,
    issueDate,
    dueDate,
    periodStart,
    periodEnd,
    amountHt,
    vatRate,
    vatAmount,
    amountTtc,
    bookingsCount: eligibleBookings.length,
  });

  const row = {
    invoice_kind: "hotel_commission",
    issuer_type: "lymfea",
    issuer_id: null,
    client_type: "hotel",
    client_id: hotel.id,
    therapist_id: null,
    hotel_id: hotel.id,
    invoice_number: invoiceNumber,
    period_start: startStr,
    period_end: endStr,
    issue_date: issueDate.toISOString().slice(0, 10),
    due_date: dueDate.toISOString().slice(0, 10),
    amount_ht: amountHt,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    amount_ttc: amountTtc,
    currency: "EUR",
    bookings_count: eligibleBookings.length,
    html_snapshot: invoiceHTML,
    issuer_snapshot: brand.legal,
    client_snapshot: profile,
    metadata: {
      booking_ids: bookingIds,
      hotel_name: hotel.name,
    },
    status: "issued",
  };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("invoices")
    .insert(row)
    .select("id")
    .single();

  if (insertError) throw insertError;
  return { success: true, invoiceId: inserted.id };
};

// ============================================================================
// Main handler
// ============================================================================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json().catch(() => ({}));
    const { mode = "manual", hotel_id } = body;

    const fallback = previousMonthRange();
    const startStr = body.period_start ?? fallback.start;
    const endStr = body.period_end ?? fallback.end;
    const periodStart = new Date(`${startStr}T00:00:00Z`);
    const periodEnd = new Date(`${endStr}T00:00:00Z`);

    console.log(`[GENERATE-VENUE-INVOICES] mode=${mode} period=${startStr}→${endStr}`);

    let hotelQuery = supabaseAdmin
      .from("hotels")
      .select("id, name, vat, address, city");
    if (hotel_id) hotelQuery = hotelQuery.eq("id", hotel_id);
    const { data: hotels, error: hotelsError } = await hotelQuery;
    if (hotelsError) throw hotelsError;

    const results: Array<Record<string, unknown>> = [];

    for (const hotel of (hotels ?? []) as Hotel[]) {
      try {
        const r = await generateForHotel(hotel, periodStart, periodEnd);
        results.push({ hotel_id: hotel.id, ...r });
      } catch (err) {
        console.error(`[GENERATE-VENUE-INVOICES] error for ${hotel.id}`, err);
        results.push({
          hotel_id: hotel.id,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        period: { start: startStr, end: endStr },
        results,
        generated: results.filter((r) => r.success && !r.skipped).length,
        skipped: results.filter((r) => r.skipped).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[GENERATE-VENUE-INVOICES] fatal", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
