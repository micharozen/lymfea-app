import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { brand } from "../_shared/brand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Security: Escape HTML entities to prevent XSS attacks
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
  therapist_id?: string;
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

interface Therapist {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface Hotel {
  id: string;
  name: string;
  therapist_commission: number | null;
  vat: number | null;
  address: string | null;
  city: string | null;
}

interface InvoiceLine {
  description: string;
  amount_ht: number;
  vat_rate: number;
}

interface GeneratedInvoiceData {
  therapist: Therapist;
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

// ============================================================================
// HTML template (Pennylane-style)
// ============================================================================

const formatDateFr = (d: Date): string =>
  d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

const formatAmount = (n: number): string =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const formatMonthYear = (d: Date): string =>
  d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

const generateInvoiceHTML = (data: GeneratedInvoiceData): string => {
  const {
    therapist,
    hotel,
    billingProfile,
    invoiceNumber,
    issueDate,
    dueDate,
    periodStart,
    amountHt,
    vatRate,
    vatAmount,
    amountTtc,
  } = data;

  const issuerName =
    billingProfile.company_name || `${therapist.first_name} ${therapist.last_name}`;

  const issuerAddressHtml = [
    billingProfile.billing_address,
    [billingProfile.billing_postal_code, billingProfile.billing_city].filter(Boolean).join(" "),
    billingProfile.billing_country,
  ]
    .filter(Boolean)
    .map((line) => escapeHtml(line as string))
    .join("<br>");

  const issuerLegalLines: string[] = [];
  if (billingProfile.siret) issuerLegalLines.push(`SIRET ${escapeHtml(billingProfile.siret)}`);
  if (billingProfile.siren && !billingProfile.siret)
    issuerLegalLines.push(`SIREN ${escapeHtml(billingProfile.siren)}`);
  if (billingProfile.tva_number && !billingProfile.vat_exempt)
    issuerLegalLines.push(`N° TVA ${escapeHtml(billingProfile.tva_number)}`);

  const legal = brand.legal;
  const clientAddressHtml = escapeHtml(legal.address).replace(/, /g, "<br>");

  const lineDescription = `Commission thérapeute — ${hotel.name} — ${formatMonthYear(periodStart)}`;

  const vatNotice = billingProfile.vat_exempt
    ? `<div class="vat-notice">TVA non applicable, art. 293 B du CGI</div>`
    : "";

  const paymentBlock =
    billingProfile.iban || billingProfile.bic
      ? `
    <div class="payment-box">
      <div class="payment-title">Paiement</div>
      <table class="payment-table">
        ${
          billingProfile.bank_name
            ? `<tr><td class="k">Établissement</td><td>${escapeHtml(billingProfile.bank_name)}</td></tr>`
            : ""
        }
        ${
          billingProfile.iban
            ? `<tr><td class="k">IBAN</td><td>${escapeHtml(billingProfile.iban)}</td></tr>`
            : ""
        }
        ${
          billingProfile.bic
            ? `<tr><td class="k">BIC</td><td>${escapeHtml(billingProfile.bic)}</td></tr>`
            : ""
        }
        <tr><td class="k">Référence</td><td>${escapeHtml(invoiceNumber)}</td></tr>
      </table>
      <div class="payment-hint">Merci d'inclure la référence dans le libellé de votre virement pour que votre paiement soit correctement identifié.</div>
    </div>`
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
  .party { }
  .party-label { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .party-name { font-weight: 600; font-size: 13px; color: #1a1a1a; }
  .party-lines { color: #555; font-size: 12px; line-height: 1.6; }

  table.items { width: 100%; border-collapse: collapse; margin-top: 24px; }
  table.items thead th {
    font-size: 10px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 8px;
    border-bottom: 1px solid #e5e5e5;
    text-align: right;
  }
  table.items thead th:first-child { text-align: left; }
  table.items tbody td {
    padding: 14px 8px;
    border-bottom: 1px solid #f2f2f2;
    text-align: right;
    font-size: 13px;
  }
  table.items tbody td:first-child { text-align: left; }

  .summary { display: flex; gap: 40px; margin-top: 24px; }
  .tva-details { flex: 1; }
  .tva-title, .reca-title {
    font-size: 13px;
    font-weight: 600;
    color: #555;
    margin-bottom: 10px;
  }
  .tva-grid {
    display: grid;
    grid-template-columns: auto auto auto;
    gap: 6px 24px;
    font-size: 12px;
  }
  .tva-grid .head { font-weight: 600; color: #888; font-size: 11px; text-transform: uppercase; }
  .reca { flex: 1; }
  .reca-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .reca-row.total {
    border-top: 1px solid #1a1a1a;
    margin-top: 6px;
    padding-top: 10px;
    font-weight: 600;
    font-size: 15px;
  }

  .vat-notice {
    margin-top: 16px;
    padding: 10px 14px;
    background: #fafafa;
    border-radius: 6px;
    font-size: 12px;
    color: #555;
    font-style: italic;
  }

  .payment-box {
    margin-top: 40px;
    padding: 20px;
    background: #fafafa;
    border-radius: 8px;
  }
  .payment-title {
    font-size: 11px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }
  .payment-table { border-collapse: collapse; font-size: 12px; }
  .payment-table td { padding: 3px 12px 3px 0; vertical-align: top; }
  .payment-table td.k { color: #666; font-weight: 500; min-width: 110px; }
  .payment-hint { margin-top: 12px; font-size: 11px; color: #888; }

  .penalties {
    margin-top: 30px;
    font-size: 10px;
    color: #888;
    line-height: 1.5;
  }

  .footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #e5e5e5;
    text-align: center;
    font-size: 10px;
    color: #888;
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
      <div class="meta-row"><span class="label">Type de vente</span><span class="value">Prestations de services</span></div>
      <div class="meta-row"><span class="label">Lieu</span><span class="value">${escapeHtml(hotel.name)}</span></div>
    </div>
    <div class="parties">
      <div class="party">
        <div class="party-label">Émetteur ou Émettrice</div>
        <div class="party-name">${escapeHtml(issuerName)}</div>
        <div class="party-lines">
          ${issuerAddressHtml || ""}
          ${issuerLegalLines.length ? "<br>" + issuerLegalLines.map(escapeHtml).join("<br>") : ""}
          ${billingProfile.contact_email ? `<br>${escapeHtml(billingProfile.contact_email)}` : ""}
        </div>
      </div>
      <div class="party">
        <div class="party-label">Client ou Cliente</div>
        <div class="party-name">${escapeHtml(legal.companyName)}</div>
        <div class="party-lines">
          ${clientAddressHtml}<br>
          SIREN ${escapeHtml(legal.siren)}<br>
          N° TVA ${escapeHtml(legal.vatNumber)}
        </div>
      </div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Produits</th>
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
        <td>1 unité</td>
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

  ${paymentBlock}

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

const monthPeriod = (baseDate?: string): { start: string; end: string } => {
  if (baseDate) {
    const [y, m] = baseDate.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }
  // Default: previous month
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

const generateForTherapistHotel = async (
  therapist: Therapist,
  hotel: Hotel,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ success: boolean; skipped?: boolean; reason?: string; invoiceId?: string }> => {
  const startStr = periodStart.toISOString().slice(0, 10);
  const endStr = periodEnd.toISOString().slice(0, 10);

  // Load bookings for this therapist at this hotel in the period
  const { data: bookings, error: bookingsError } = await supabaseAdmin
    .from("bookings")
    .select("id, total_price, status, payment_status, booking_date")
    .eq("therapist_id", therapist.id)
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

  // Load any existing payouts for these bookings (preferred source of truth)
  const bookingIds = eligibleBookings.map((b) => b.id);
  const { data: payouts } = await supabaseAdmin
    .from("therapist_payouts")
    .select("booking_id, amount")
    .in("booking_id", bookingIds);

  const payoutMap = new Map<string, number>();
  (payouts ?? []).forEach((p) => payoutMap.set(p.booking_id, Number(p.amount)));

  // Compute commission per booking
  const commissionPct = Number(hotel.therapist_commission ?? 0);
  let amountHt = 0;
  for (const b of eligibleBookings) {
    const fromPayout = payoutMap.get(b.id);
    if (fromPayout !== undefined) {
      amountHt += fromPayout;
    } else {
      const total = Number(b.total_price ?? 0);
      amountHt += (total * commissionPct) / 100;
    }
  }
  amountHt = Math.round(amountHt * 100) / 100;

  if (amountHt <= 0) {
    return { success: true, skipped: true, reason: "zero_amount" };
  }

  // Load therapist billing profile
  const { data: billingProfile } = await supabaseAdmin
    .from("billing_profiles")
    .select("*")
    .eq("owner_type", "therapist")
    .eq("owner_id", therapist.id)
    .maybeSingle();

  const profile: BillingProfile = billingProfile ?? {};
  const vatRate = profile.vat_exempt ? 0 : 20;
  const vatAmount = Math.round(((amountHt * vatRate) / 100) * 100) / 100;
  const amountTtc = Math.round((amountHt + vatAmount) * 100) / 100;

  const issueDate = new Date();
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + 30);

  // Check if an invoice already exists for this (kind, therapist, hotel, period) — reuse its number
  const { data: existing } = await supabaseAdmin
    .from("invoices")
    .select("id, invoice_number")
    .eq("invoice_kind", "therapist_commission")
    .eq("therapist_id", therapist.id)
    .eq("hotel_id", hotel.id)
    .eq("period_start", startStr)
    .maybeSingle();

  const invoiceNumber = existing?.invoice_number ?? (await nextInvoiceNumber());

  const invoiceHTML = generateInvoiceHTML({
    therapist,
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

  // Upsert invoice record
  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from("invoices")
    .upsert(
      {
        invoice_kind: "therapist_commission",
        issuer_type: "therapist",
        issuer_id: therapist.id,
        client_type: "lymfea",
        client_id: null,
        therapist_id: therapist.id,
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
        issuer_snapshot: profile,
        client_snapshot: brand.legal,
        metadata: {
          booking_ids: bookingIds,
          therapist_name: `${therapist.first_name} ${therapist.last_name}`,
          hotel_name: hotel.name,
        },
        status: "issued",
      },
      { onConflict: "invoice_kind,therapist_id,hotel_id,period_start" },
    )
    .select("id")
    .single();

  if (upsertError) throw upsertError;

  return { success: true, invoiceId: upserted.id };
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
    const { mode = "manual", therapist_id, hotel_id } = body;

    const { start, end } = monthPeriod(body.period_start);
    const periodStart = new Date(`${start}T00:00:00Z`);
    const periodEnd = new Date(`${body.period_end ?? end}T00:00:00Z`);

    console.log(`[GENERATE-THERAPIST-INVOICES] mode=${mode} period=${start}→${end}`);

    // Fetch target therapists
    let therapistQuery = supabaseAdmin
      .from("therapists")
      .select("id, first_name, last_name, email")
      .eq("status", "Actif");
    if (therapist_id) therapistQuery = therapistQuery.eq("id", therapist_id);
    const { data: therapists, error: therapistsError } = await therapistQuery;
    if (therapistsError) throw therapistsError;

    const results: Array<Record<string, unknown>> = [];

    for (const therapist of therapists ?? []) {
      // Fetch therapist's venues
      let venuesQuery = supabaseAdmin
        .from("therapist_venues")
        .select("hotel_id, hotels(id, name, therapist_commission, vat, address, city)")
        .eq("therapist_id", therapist.id);
      if (hotel_id) venuesQuery = venuesQuery.eq("hotel_id", hotel_id);
      const { data: venues, error: venuesError } = await venuesQuery;
      if (venuesError) throw venuesError;

      for (const venue of venues ?? []) {
        const hotel = (venue as unknown as { hotels: Hotel }).hotels;
        if (!hotel) continue;
        try {
          const r = await generateForTherapistHotel(
            therapist as Therapist,
            hotel,
            periodStart,
            periodEnd,
          );
          results.push({
            therapist_id: therapist.id,
            hotel_id: hotel.id,
            ...r,
          });
        } catch (err) {
          console.error(`[GENERATE-THERAPIST-INVOICES] error for ${therapist.id}/${hotel.id}`, err);
          results.push({
            therapist_id: therapist.id,
            hotel_id: hotel.id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        period: { start, end },
        results,
        generated: results.filter((r) => r.success && !r.skipped).length,
        skipped: results.filter((r) => r.skipped).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[GENERATE-THERAPIST-INVOICES] fatal", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
