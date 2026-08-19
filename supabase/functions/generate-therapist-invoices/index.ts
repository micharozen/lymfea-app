import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { brand } from "../_shared/brand.ts";
import { computeTherapistEarnings } from "../_shared/therapistEarnings.ts";
import { myLegTreatments } from "../_shared/therapistLegDuration.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { getBaseEmailTemplate, getEmailHeader } from "../_shared/email-template.ts";
import {
  resolveIssuerLegal,
  type BillingProfileLegal,
  type ResolvedIssuer,
} from "../_shared/issuer-legal.ts";

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
  /** `preview` calcule les montants sans rien écrire en base (dry-run). */
  mode?: "auto" | "manual" | "send" | "preview";
  therapist_id?: string;
  hotel_id?: string;
  period_start?: string;
  period_end?: string;
  /** En mode preview : renvoie aussi le HTML de la facture (coûteux, un seul thérapeute). */
  include_html?: boolean;
  // Used only when mode === "send"
  invoice_id?: string;
  /** Base64-encoded PDF (without data-URI prefix), rendered client-side. */
  pdf_base64?: string;
}

type SkipReason = "no_bookings" | "zero_amount" | "missing_rates";

interface TherapistHotelResult {
  success: boolean;
  skipped?: boolean;
  reason?: SkipReason;
  /** Renseigné uniquement lors d'une écriture réelle. */
  invoiceId?: string;
  bookingsCount?: number;
  amountHt?: number;
  vatRate?: number;
  vatAmount?: number;
  amountTtc?: number;
  /** Facture déjà en base sur cette date de début — sera remplacée. */
  existingInvoiceId?: string;
  existingInvoiceNumber?: string;
  existingPeriodEnd?: string;
  /** Dry-run avec `include_html` uniquement. */
  htmlSnapshot?: string;
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
  vat: number | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  organization_id: string | null;
  out_of_hours_surcharge_percent: number | null;
  invoice_client: string | null;
}

/**
 * Identité du destinataire de la facture pour un lieu qui facture en direct.
 * Utilise le profil de facturation du lieu quand il existe, sinon retombe sur
 * les coordonnées saisies sur la fiche du lieu.
 */
const resolveVenueClient = (
  hotel: Hotel,
  venueProfile: BillingProfile | null,
): ResolvedIssuer => {
  const address =
    [
      venueProfile?.billing_address ?? hotel.address,
      [
        venueProfile?.billing_postal_code ?? hotel.postal_code,
        venueProfile?.billing_city ?? hotel.city,
      ]
        .map((p) => p?.trim())
        .filter(Boolean)
        .join(" "),
      venueProfile?.billing_country,
    ]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(", ") || "";

  return {
    issuerName: venueProfile?.company_name?.trim() || hotel.name.trim(),
    companyName: venueProfile?.company_name?.trim() || hotel.name.trim(),
    companyType: venueProfile?.legal_form?.trim() || "",
    capital: "",
    siren: (venueProfile?.siren || venueProfile?.siret?.slice(0, 9) || "").trim(),
    vatNumber: (venueProfile?.tva_number || "").trim(),
    address,
  };
};

// One detail row on the invoice = one billed booking.
interface InvoiceLineDetail {
  date: string; // booking_date (YYYY-MM-DD)
  clientName: string; // nom du client du soin
  label: string; // treatment name(s)
  durationMin: number;
  amountHt: number;
}

interface GeneratedInvoiceData {
  therapist: Therapist;
  hotel: Hotel;
  billingProfile: BillingProfile;
  // Organisation propriétaire du lieu : destinataire par défaut de la facture.
  platformLegal: ResolvedIssuer;
  // Partie facturée par le thérapeute (« Client ou Cliente »). Vaut
  // platformLegal, sauf pour les lieux réglés sur hotels.invoice_client = 'venue'.
  invoiceClient: ResolvedIssuer;
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
  lines: InvoiceLineDetail[];
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

/**
 * Libellé de la période facturée. Un mois entier reste affiché « août 2026 » ;
 * toute autre plage affiche ses bornes, sans quoi une facture du 10 au 20 août
 * s'annoncerait comme couvrant le mois complet.
 */
const formatPeriodLabel = (start: Date, end: Date): string => {
  const isFirstOfMonth = start.getUTCDate() === 1;
  const isLastOfMonth =
    end.getUTCDate() ===
    new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();

  if (isFirstOfMonth && isLastOfMonth && sameMonth) return formatMonthYear(start);
  return `${formatDateFr(start)} → ${formatDateFr(end)}`;
};

const generateInvoiceHTML = (data: GeneratedInvoiceData): string => {
  const {
    therapist,
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
    lines,
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

  // Mentions légales du pied de page = celles de l'émetteur, ici le thérapeute.
  // L'organisation propriétaire du lieu n'y figure pas : elle n'est partie à la
  // facture que lorsqu'elle en est la destinataire, et elle apparaît alors dans
  // le bloc « Client ou Cliente ». Chaque segment est omis quand la donnée
  // manque, jamais remplacé par celle d'une autre société.
  const footerLegalLine = [
    [issuerName, billingProfile.legal_form].filter(Boolean).join(" · "),
    billingProfile.siret ? `N° SIRET ${billingProfile.siret}` : "",
    !billingProfile.siret && billingProfile.siren ? `N° SIREN ${billingProfile.siren}` : "",
    billingProfile.tva_number && !billingProfile.vat_exempt
      ? `N° TVA ${billingProfile.tva_number}`
      : "",
  ]
    .filter(Boolean)
    .map((part) => escapeHtml(part as string))
    .join(" · ");
  const client = data.invoiceClient;
  const clientAddressHtml = escapeHtml(client.address).replace(/, /g, "<br>");
  const clientLegalLines: string[] = [];
  if (client.siren) clientLegalLines.push(`SIREN ${escapeHtml(client.siren)}`);
  if (client.vatNumber) clientLegalLines.push(`N° TVA ${escapeHtml(client.vatNumber)}`);

  const detailRows = lines
    .map((ln) => {
      const durLabel = ln.durationMin > 0 ? `${ln.durationMin} min` : "—";
      return `<tr>
        <td class="date">${formatDateFr(new Date(`${ln.date}T00:00:00Z`))}</td>
        <td class="client">${escapeHtml(ln.clientName)}</td>
        <td>${escapeHtml(ln.label)}</td>
        <td>${durLabel}</td>
        <td>${formatAmount(ln.amountHt)}</td>
      </tr>`;
    })
    .join("");

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

  .items-caption {
    margin-top: 24px;
    font-size: 12px;
    font-weight: 600;
    color: #555;
  }
  table.items { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
  table.items col.col-date { width: 100px; }
  table.items col.col-client { width: 130px; }
  table.items col.col-desc { width: auto; }
  table.items col.col-dur { width: 70px; }
  table.items col.col-ht { width: 110px; }
  table.items td.date { white-space: nowrap; color: #555; }
  table.items tr.items-total td {
    border-top: 1px solid #1a1a1a;
    border-bottom: none;
    font-weight: 600;
    padding-top: 12px;
  }
  table.items thead th {
    font-size: 10px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 6px;
    border-bottom: 1px solid #e5e5e5;
    text-align: right;
    white-space: nowrap;
  }
  table.items thead th:first-child { text-align: left; }
  table.items thead th:nth-child(2),
  table.items thead th:nth-child(3) { text-align: left; }
  table.items td.client {
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  table.items tbody td {
    padding: 14px 6px;
    border-bottom: 1px solid #f2f2f2;
    text-align: right;
    font-size: 13px;
    white-space: nowrap;
  }
  table.items tbody td:first-child { text-align: left; white-space: normal; word-break: break-word; }

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
        <div class="party-name">${escapeHtml(client.companyName)}</div>
        <div class="party-lines">
          ${clientAddressHtml}${clientLegalLines.length ? "<br>" + clientLegalLines.join("<br>") : ""}
        </div>
      </div>
    </div>
  </div>

  <div class="items-caption">Détail des prestations — ${escapeHtml(hotel.name)} — ${formatPeriodLabel(periodStart, periodEnd)}</div>
  <table class="items">
    <colgroup>
      <col class="col-date">
      <col class="col-client">
      <col class="col-desc">
      <col class="col-dur">
      <col class="col-ht">
    </colgroup>
    <thead>
      <tr>
        <th>Date</th>
        <th>Client</th>
        <th>Prestation</th>
        <th>Durée</th>
        <th>Montant HT</th>
      </tr>
    </thead>
    <tbody>
      ${detailRows}
      <tr class="items-total">
        <td></td>
        <td></td>
        <td>Total prestations (${data.bookingsCount})</td>
        <td></td>
        <td>${formatAmount(amountHt)}</td>
      </tr>
    </tbody>
  </table>

  <div class="summary">
    ${
      billingProfile.vat_exempt
        ? `<div class="tva-details"></div>`
        : `<div class="tva-details">
      <div class="tva-title">Détails TVA</div>
      <div class="tva-grid">
        <div class="head">Taux</div><div class="head">Montant TVA</div><div class="head">Base HT</div>
        <div>${vatRate}%</div>
        <div>${formatAmount(vatAmount)}</div>
        <div>${formatAmount(amountHt)}</div>
      </div>
    </div>`
    }
    <div class="reca">
      <div class="reca-title">Récapitulatif</div>
      <div class="reca-row"><span>Total HT</span><span>${formatAmount(amountHt)}</span></div>
      ${
        billingProfile.vat_exempt
          ? ""
          : `<div class="reca-row"><span>Total TVA</span><span>${formatAmount(vatAmount)}</span></div>`
      }
      <div class="reca-row total"><span>${billingProfile.vat_exempt ? "Net à payer" : "Total TTC"}</span><span>${formatAmount(amountTtc)}</span></div>
    </div>
  </div>

  ${vatNotice}

  ${paymentBlock}

  <div class="penalties">
    Pénalités de retard : trois fois le taux annuel d'intérêt légal en vigueur calculé depuis la date d'échéance jusqu'à complet paiement du prix.<br>
    Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.
  </div>

  <div class="footer">
    ${footerLegalLine}${footerLegalLine ? "<br>" : ""}
    Généré par Saoma
  </div>
</div>
</body>
</html>`;
};

// ============================================================================
// Business logic
// ============================================================================

/** Mois précédent — période par défaut de la génération automatique. */
const monthPeriod = (): { start: string; end: string } => {
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
  opts: { dryRun?: boolean; includeHtml?: boolean } = {},
): Promise<TherapistHotelResult> => {
  const startStr = periodStart.toISOString().slice(0, 10);
  const endStr = periodEnd.toISOString().slice(0, 10);

  const bookingSelect =
    "id, total_price, duration, status, payment_status, booking_date, is_out_of_hours, guest_count, therapist_id, client_first_name, client_last_name, customers(first_name, last_name), booking_treatments(therapist_id, is_addon, treatment_menus(name, duration), treatment_variants(label, duration))";
  // Un no-show est facturé 100 % au client : le thérapeute s'est déplacé, il est
  // rémunéré comme pour un soin réalisé. Les deux orthographes du statut
  // coexistent en base (legacy `no_show`).
  const applyEligibility = (q: any) =>
    q
      .eq("hotel_id", hotel.id)
      .gte("booking_date", startStr)
      .lte("booking_date", endStr)
      .in("status", ["completed", "noshow", "no_show"])
      .in("payment_status", ["paid", "charged_to_room", "offert"]);

  // Bookings where this therapist is the primary (solo + legacy).
  const { data: primaryBookings, error: bookingsError } = await applyEligibility(
    supabaseAdmin.from("bookings").select(bookingSelect).eq("therapist_id", therapist.id),
  );
  if (bookingsError) throw bookingsError;

  // Duo bookings where this therapist is an accepted (possibly non-primary) participant.
  // Le filtre lieu + période est appliqué via la jointure : sans lui, PostgREST
  // plafonne à 1000 lignes et un thérapeute au long historique perdrait ses duos
  // récents.
  const { data: btRows } = await supabaseAdmin
    .from("booking_therapists")
    .select("booking_id, bookings!inner(hotel_id, booking_date)")
    .eq("therapist_id", therapist.id)
    .eq("status", "accepted")
    .eq("bookings.hotel_id", hotel.id)
    .gte("bookings.booking_date", startStr)
    .lte("bookings.booking_date", endStr);
  const duoIds = (btRows ?? []).map((r: { booking_id: string }) => r.booking_id);
  let duoBookings: any[] = [];
  if (duoIds.length > 0) {
    const { data } = await applyEligibility(
      supabaseAdmin.from("bookings").select(bookingSelect).in("id", duoIds),
    );
    duoBookings = data ?? [];
  }

  // Merge unique by booking id.
  const bookingById = new Map<string, any>();
  for (const b of [...(primaryBookings ?? []), ...duoBookings]) bookingById.set(b.id, b);
  const eligibleBookings = [...bookingById.values()];
  if (eligibleBookings.length === 0) {
    return { success: true, skipped: true, reason: "no_bookings", bookingsCount: 0 };
  }

  // Load THIS therapist's payouts for these bookings (preferred source of truth).
  // Filtering by therapist_id is required for duo bookings, which have one payout
  // row per therapist.
  const bookingIds = eligibleBookings.map((b) => b.id);
  const { data: payouts } = await supabaseAdmin
    .from("therapist_payouts")
    .select("booking_id, amount")
    .eq("therapist_id", therapist.id)
    .in("booking_id", bookingIds);

  const payoutMap = new Map<string, number>();
  (payouts ?? []).forEach((p) => payoutMap.set(p.booking_id, Number(p.amount)));

  // Accepted therapists per booking, in acceptance order: needed to attribute
  // each therapist their own leg on a duo (see myLegTreatments) instead of
  // billing them the whole booking.
  const { data: acceptedRows } = await supabaseAdmin
    .from("booking_therapists")
    .select("booking_id, therapist_id, assigned_at")
    .in("booking_id", bookingIds)
    .eq("status", "accepted")
    .order("assigned_at", { ascending: true });

  const therapistIdsByBooking = new Map<string, string[]>();
  for (const r of (acceptedRows ?? []) as Array<{ booking_id: string; therapist_id: string }>) {
    const ids = therapistIdsByBooking.get(r.booking_id) ?? [];
    ids.push(r.therapist_id);
    therapistIdsByBooking.set(r.booking_id, ids);
  }

  // Load therapist rates for fallback computation when no payout exists
  const { data: therapistRow } = await supabaseAdmin
    .from("therapists")
    .select("rate_45, rate_60, rate_75, rate_90, rate_105, rate_120, rate_150")
    .eq("id", therapist.id)
    .maybeSingle();

  const rates = therapistRow
    ? {
        rate_45: therapistRow.rate_45 ?? null,
        rate_60: therapistRow.rate_60 ?? null,
        rate_75: therapistRow.rate_75 ?? null,
        rate_90: therapistRow.rate_90 ?? null,
        rate_105: therapistRow.rate_105 ?? null,
        rate_120: therapistRow.rate_120 ?? null,
        rate_150: therapistRow.rate_150 ?? null,
      }
    : null;

  // Out-of-hours uplift for the rate fallback, mirroring the venue setting
  // used at booking time (see CreateBookingDialog / DuoRecapTable).
  const surchargePercent = Number(hotel.out_of_hours_surcharge_percent) || 0;

  // Compute earnings per booking using duration-based rates, and build the
  // per-booking detail lines shown on the invoice.
  let amountHt = 0;
  const lines: InvoiceLineDetail[] = [];
  // Track bookings whose earnings couldn't be computed because the therapist's
  // rates are missing/incomplete (no payout to fall back on either).
  let missingRateCount = 0;
  for (const b of eligibleBookings) {
    const treatments = ((b as any).booking_treatments || []) as Array<{
      therapist_id?: string | null;
      is_addon?: boolean | null;
      treatment_menus?: { name?: string | null; duration?: number | null } | null;
      treatment_variants?: { label?: string | null; duration?: number | null } | null;
    }>;
    // La durée réellement réservée est celle de la variante quand il y en a une
    // (ex. « LET IT GO BODY » 60 min au menu, variante 90 min) ; sans variante on
    // retombe sur la durée du soin.
    const lineDuration = (bt: (typeof treatments)[number]): number =>
      bt.treatment_variants?.duration ?? bt.treatment_menus?.duration ?? 0;
    // When the stable soin↔therapist link is present, this therapist is paid on
    // the sum of THEIR soins; otherwise fall back to the booking duration (or the
    // total treatment duration). Only used when no payout row exists (see below).
    const linkedDuration = treatments.some((bt) => bt.therapist_id != null)
      ? treatments
          .filter((bt) => bt.therapist_id === therapist.id)
          .reduce((sum, bt) => sum + lineDuration(bt), 0)
      : 0;
    const treatmentsDuration = treatments.reduce((sum, bt) => sum + lineDuration(bt), 0);
    // bookings.duration peut rester sur la durée du menu alors que la variante
    // réservée est plus longue (résa #627 : 2 × variante 90 min, duration = 60),
    // ce qui facture le thérapeute au tarif 60. Le repli est donc plancher-né par
    // le soin de base le plus long : on ne somme pas (duo = soins en parallèle,
    // solo enchaîné = bookings.duration porte déjà la somme).
    const longestBaseTreatment = treatments
      .filter((bt) => !bt.is_addon)
      .reduce((max, bt) => Math.max(max, lineDuration(bt)), 0);
    const bookingDuration = Math.max(Number((b as any).duration) || 0, longestBaseTreatment);

    // Sur un duo, le thérapeute n'est facturé QUE sur son leg (son soin de base +
    // les add-ons qu'il porte), jamais sur l'intégralité des prestations du
    // booking — même échelle d'attribution que les payouts (myLegTreatments).
    // Un thérapeute seul est payé sur tout, quoi qu'annonce guest_count.
    const orderedTherapistIds = therapistIdsByBooking.get(b.id) ??
      ((b as any).therapist_id ? [(b as any).therapist_id as string] : []);
    const effectiveGuestCount = orderedTherapistIds.length > 1
      ? Number((b as any).guest_count) || 1
      : 1;
    const legTreatments = myLegTreatments(
      therapist.id,
      treatments.map((bt) => ({ ...bt, duration: lineDuration(bt) })),
      orderedTherapistIds,
      effectiveGuestCount,
    );
    const legDuration = legTreatments.reduce((sum, bt) => sum + bt.duration, 0);

    const isDuo = effectiveGuestCount > 1;
    const dur = isDuo && legDuration > 0
      ? legDuration
      : !isDuo && linkedDuration > 0
      ? linkedDuration
      : bookingDuration > 0
      ? bookingDuration
      : treatmentsDuration;
    const isNoShow = ["noshow", "no_show"].includes(String((b as any).status));
    const treatmentsLabel =
      legTreatments
        .map((bt) => {
          const name = bt.treatment_menus?.name;
          if (!name) return null;
          const variant = bt.treatment_variants?.label?.trim();
          return variant ? `${name} · ${variant}` : name;
        })
        .filter(Boolean)
        .join(" + ") || "Prestation";
    const label = isNoShow ? `${treatmentsLabel} (no-show)` : treatmentsLabel;

    // Identité du client : la fiche customer fait foi (les colonnes client_* de
    // bookings sont en cours de retrait), avec repli sur ces colonnes tant
    // qu'une réservation n'est pas rattachée à un customer.
    const customer = (b as any).customers as
      | { first_name?: string | null; last_name?: string | null }
      | null;
    const clientName =
      [customer?.first_name, customer?.last_name]
        .map((p) => p?.trim())
        .filter(Boolean)
        .join(" ") ||
      [(b as any).client_first_name, (b as any).client_last_name]
        .map((p: string | null) => p?.trim())
        .filter(Boolean)
        .join(" ") ||
      "—";

    // Payouts are the per-therapist source of truth; fall back to
    // duration-based rates only when no payout row exists. The fallback must
    // mirror the out-of-hours uplift applied at booking time, otherwise
    // out-of-hours bookings are billed at the base rate.
    const fromPayout = payoutMap.get(b.id);
    let amount: number;
    if (fromPayout !== undefined) {
      amount = fromPayout;
    } else {
      const earned = computeTherapistEarnings(
        rates,
        dur,
        (b as any).is_out_of_hours ? { surchargePercent } : undefined,
      );
      if (earned === null) {
        missingRateCount += 1;
        continue;
      }
      amount = earned;
    }
    amountHt += amount;
    lines.push({
      date: (b as any).booking_date,
      clientName,
      label,
      durationMin: dur,
      amountHt: Math.round(amount * 100) / 100,
    });
  }
  amountHt = Math.round(amountHt * 100) / 100;
  // Chronological order for a readable statement.
  lines.sort((a, b) => a.date.localeCompare(b.date));

  if (amountHt <= 0) {
    // Distinguish "no rates configured" from a genuine zero so the UI can
    // tell the admin to set the therapist's rates instead of showing a
    // misleading "nothing to bill" message.
    if (missingRateCount > 0) {
      return {
        success: true,
        skipped: true,
        reason: "missing_rates",
        bookingsCount: eligibleBookings.length,
        amountHt,
      };
    }
    return {
      success: true,
      skipped: true,
      reason: "zero_amount",
      bookingsCount: eligibleBookings.length,
      amountHt,
    };
  }

  // Load therapist billing profile
  const { data: billingProfile } = await supabaseAdmin
    .from("billing_profiles")
    .select("*")
    .eq("owner_type", "therapist")
    .eq("owner_id", therapist.id)
    .maybeSingle();

  const profile: BillingProfile = billingProfile ?? {};

  // Destinataire par défaut de l'auto-facture : l'organisation propriétaire du
  // lieu, via son profil de facturation.
  let orgProfile: BillingProfileLegal | null = null;
  if (hotel.organization_id) {
    const { data: org } = await supabaseAdmin
      .from("billing_profiles")
      .select("*")
      .eq("owner_type", "organization")
      .eq("owner_id", hotel.organization_id)
      .maybeSingle();
    orgProfile = org;
  }
  const platformLegal = resolveIssuerLegal(orgProfile);

  // Destinataire de la facture : l'organisation propriétaire du lieu, sauf
  // pour les lieux réglés sur « facture en direct » (hotels.invoice_client).
  const billedByVenue = hotel.invoice_client === "venue";
  let invoiceClient = platformLegal;
  if (billedByVenue) {
    const { data: venueProfile } = await supabaseAdmin
      .from("billing_profiles")
      .select("*")
      .eq("owner_type", "hotel")
      .eq("owner_id", hotel.id)
      .maybeSingle();
    invoiceClient = resolveVenueClient(hotel, venueProfile);
  }

  const vatRate = profile.vat_exempt ? 0 : 20;
  const vatAmount = Math.round(((amountHt * vatRate) / 100) * 100) / 100;
  const amountTtc = Math.round((amountHt + vatAmount) * 100) / 100;

  const issueDate = new Date();
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + 30);

  // Check if an invoice already exists for this (kind, therapist, hotel, period) — reuse its number
  const { data: existing } = await supabaseAdmin
    .from("invoices")
    .select("id, invoice_number, period_end")
    .eq("invoice_kind", "therapist_commission")
    .eq("therapist_id", therapist.id)
    .eq("hotel_id", hotel.id)
    .eq("period_start", startStr)
    .maybeSingle();

  // `next_invoice_number()` consomme définitivement un numéro de séquence : un
  // dry-run ne doit jamais l'appeler, au risque de trouer la numérotation.
  const invoiceNumber = existing?.invoice_number ??
    (opts.dryRun ? "—" : await nextInvoiceNumber());

  const needsHtml = !opts.dryRun || opts.includeHtml === true;
  const invoiceHTML = !needsHtml ? null : generateInvoiceHTML({
    therapist,
    hotel,
    billingProfile: profile,
    platformLegal,
    invoiceClient,
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
    lines,
  });

  const amounts = {
    bookingsCount: eligibleBookings.length,
    amountHt,
    vatRate,
    vatAmount,
    amountTtc,
  };

  // Dry-run : on sort avant toute écriture, en signalant la facture qui serait
  // remplacée pour que l'UI puisse demander confirmation.
  if (opts.dryRun) {
    return {
      success: true,
      ...amounts,
      existingInvoiceId: existing?.id,
      existingInvoiceNumber: existing?.invoice_number,
      existingPeriodEnd: existing?.period_end,
      htmlSnapshot: invoiceHTML ?? undefined,
    };
  }

  // Upsert invoice record
  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from("invoices")
    .upsert(
      {
        invoice_kind: "therapist_commission",
        issuer_type: "therapist",
        issuer_id: therapist.id,
        client_type: billedByVenue ? "hotel" : "lymfea",
        client_id: billedByVenue ? hotel.id : null,
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
        client_snapshot: invoiceClient,
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

  return { success: true, invoiceId: upserted.id, ...amounts };
};

// ============================================================================
// Send an existing invoice to its therapist by email (PDF attachment)
// ============================================================================

const jsonResponse = (payload: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const handleSendInvoice = async (body: RequestBody): Promise<Response> => {
  const { invoice_id, pdf_base64 } = body;

  if (!invoice_id || !pdf_base64) {
    return jsonResponse({ error: "invoice_id and pdf_base64 are required" }, 400);
  }

  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from("invoices")
    .select(
      "id, invoice_number, therapist_id, period_start, period_end, therapists(first_name, last_name, email)",
    )
    .eq("id", invoice_id)
    .eq("invoice_kind", "therapist_commission")
    .maybeSingle();

  if (invoiceError) throw invoiceError;
  if (!invoice) {
    return jsonResponse({ error: "Invoice not found" }, 404);
  }

  const therapist = invoice.therapists as
    | { first_name: string; last_name: string; email: string | null }
    | null;
  const recipient = therapist?.email?.trim();

  if (!recipient) {
    return jsonResponse({ error: "Therapist has no email address" }, 422);
  }

  const period = new Date(`${invoice.period_start}T00:00:00Z`).toLocaleDateString(
    "fr-FR",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  const therapistName = therapist
    ? `${therapist.first_name} ${therapist.last_name}`.trim()
    : "";

  const headerContent = `
    ${getEmailHeader("Votre facture", `Facture ${escapeHtml(invoice.invoice_number)}`, "#111827")}
    <tr><td style="padding:0 30px 20px;text-align:center;">
      <p style="margin:0;font-size:15px;color:#333;">Bonjour ${escapeHtml(therapistName)},</p>
      <p style="margin:12px 0 0;font-size:14px;color:#6b7280;">
        Vous trouverez ci-joint votre facture <strong>${escapeHtml(invoice.invoice_number)}</strong>
        pour la période de <strong>${escapeHtml(period)}</strong>.
      </p>
    </td></tr>
  `;

  const html = getBaseEmailTemplate(headerContent);

  const result = await sendEmail({
    to: recipient,
    subject: `[${brand.name}] Votre facture ${invoice.invoice_number}`,
    html,
    attachments: [
      {
        filename: `${invoice.invoice_number}.pdf`,
        content: pdf_base64,
        contentType: "application/pdf",
      },
    ],
  });

  if (result.error) {
    console.error("[GENERATE-THERAPIST-INVOICES] send error:", result.error);
    return jsonResponse({ error: result.error }, 500);
  }

  return jsonResponse({ success: true, id: result.id, recipient });
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

    // Send an already-generated invoice to its therapist (PDF attachment).
    if (mode === "send") {
      return await handleSendInvoice(body);
    }

    // La période demandée est respectée telle quelle : la normaliser au mois
    // entier ferait facturer des prestations hors de la plage choisie.
    const fallback = monthPeriod();
    const start = body.period_start ?? fallback.start;
    const end = body.period_end ?? fallback.end;
    const periodStart = new Date(`${start}T00:00:00Z`);
    const periodEnd = new Date(`${end}T00:00:00Z`);

    console.log(`[GENERATE-THERAPIST-INVOICES] mode=${mode} period=${start}→${end}`);

    // Fetch target therapists
    let therapistQuery = supabaseAdmin
      .from("therapists")
      .select("id, first_name, last_name, email")
      .in("status", ["active", "Actif", "Active"]);
    if (therapist_id) therapistQuery = therapistQuery.eq("id", therapist_id);
    const { data: therapists, error: therapistsError } = await therapistQuery;
    if (therapistsError) throw therapistsError;

    const dryRun = mode === "preview";
    const results: Array<Record<string, unknown>> = [];

    // Le traitement d'un thérapeute est indépendant des autres : on en mène
    // plusieurs de front, sans quoi un lieu à 30 thérapeutes met une dizaine de
    // secondes à répondre.
    const CONCURRENCY = 5;
    const queue = [...(therapists ?? [])];

    const processTherapist = async (therapist: Therapist) => {
      // Fetch therapist's venues
      let venuesQuery = supabaseAdmin
        .from("therapist_venues")
        .select(
          "hotel_id, hotels(id, name, vat, address, postal_code, city, organization_id, out_of_hours_surcharge_percent, invoice_client)",
        )
        .eq("therapist_id", therapist.id);
      if (hotel_id) venuesQuery = venuesQuery.eq("hotel_id", hotel_id);
      const { data: venues, error: venuesError } = await venuesQuery;
      if (venuesError) throw venuesError;

      const identity = {
        therapist_id: therapist.id,
        therapist_name: `${therapist.first_name} ${therapist.last_name}`.trim(),
        therapist_email: therapist.email ?? null,
      };

      for (const venue of venues ?? []) {
        const hotel = (venue as unknown as { hotels: Hotel }).hotels;
        if (!hotel) continue;
        try {
          const r = await generateForTherapistHotel(
            therapist as Therapist,
            hotel,
            periodStart,
            periodEnd,
            { dryRun, includeHtml: body.include_html === true },
          );
          results.push({
            ...identity,
            hotel_id: hotel.id,
            hotel_name: hotel.name,
            ...r,
          });
        } catch (err) {
          console.error(`[GENERATE-THERAPIST-INVOICES] error for ${therapist.id}/${hotel.id}`, err);
          results.push({
            ...identity,
            hotel_id: hotel.id,
            hotel_name: hotel.name,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          await processTherapist(next as Therapist);
        } catch (err) {
          // L'échec d'un thérapeute (lecture de ses lieux) ne doit pas
          // interrompre le traitement des autres.
          console.error(`[GENERATE-THERAPIST-INVOICES] therapist ${next.id} failed`, err);
          results.push({
            therapist_id: next.id,
            therapist_name: `${next.first_name} ${next.last_name}`.trim(),
            hotel_id: hotel_id ?? null,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
    await Promise.all(workers);

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
