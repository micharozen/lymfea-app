/**
 * Migration des réservations historiques de l'Hôtel de Buci depuis les exports.
 *
 * - `Rdv Buci.xls` est en réalité une table HTML (liste de rendez-vous).
 * - `Client Buci1.xlsx` (Excel binaire, colonnes client/Ville/Téléphone/Mobile#) est
 *   pré-converti en `customers.csv` (colonnes name,phone) via openpyxl :
 *
 *     python3 - <<'PY'
 *     import openpyxl, csv
 *     ws=openpyxl.load_workbook('Client Buci1.xlsx', read_only=True, data_only=True).active
 *     rows=list(ws.iter_rows(values_only=True)); h=rows[0]
 *     iN=h.index('client'); iTel=h.index('Téléphone'); iFix=h.index('Téléphone fixe#'); iMob=h.index('Mobile#')
 *     def np(v):
 *         if v in (None,''): return ''
 *         s=''.join(ch for ch in str(v).split('.')[0] if ch.isdigit() or ch=='+')
 *         if not s: return ''
 *         if s.startswith('+'): return s
 *         if s.startswith('0033'): return '+'+s[2:]
 *         if s.startswith('33') and len(s)>=11: return '+'+s
 *         if s.startswith('0') and len(s)==10: return '+33'+s[1:]
 *         if len(s)==9: return '+33'+s
 *         return '+'+s
 *     out=[((r[iN] or '').strip(), np(r[iMob]) or np(r[iTel]) or np(r[iFix])) for r in rows[1:] if (r[iN] or '').strip()]
 *     csv.writer(open('customers.csv','w',newline='',encoding='utf-8')).writerows([['name','phone'],*out])
 *     PY
 *
 * Le dry-run/commit déduplique clients + bookings + amenities contre la prod
 * (l'import de juin est déjà commité) pour rester idempotent.
 *
 * Usage:
 *   bun migration/buci/import-buci.ts --dry-run   → écrit les CSV dans migration/buci/output/, aucune écriture DB
 *   bun migration/buci/import-buci.ts --commit    → insère (customers → bookings/booking_treatments → amenity_bookings)
 *
 * Requiert SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (cf. .env.prod.local) :
 *   set -a && source .env.prod.local && set +a && bun migration/buci/import-buci.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ── Constantes du venue (PROD, Hôtel de Buci) ──────────────────────────────
const HOTEL_ID = "cc327810-c287-4f0f-bc32-2e6f37094ca3";
const ROOM_CABINE_ID = "c4611bd8-f386-47e1-b56c-b9008025aead";
const AMENITY_POOL_ID = "feff910d-0b5f-4cb2-a2cf-32a25a108976";

const MIGRATION_DIR = join(import.meta.dir);
const OUTPUT_DIR = join(MIGRATION_DIR, "output");
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ── Parsing HTML des .xls ──────────────────────────────────────────────────
function parseRows(file: string): string[][] {
  const data = readFileSync(join(MIGRATION_DIR, file), "utf-8").replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  for (const rec of data.split(/<\/tr>/i)) {
    const cells = [...rec.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim(),
    );
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è");
}

// ── Parsing CSV clients (name,phone) ────────────────────────────────────────
function parseCsv(file: string): string[][] {
  const data = readFileSync(join(MIGRATION_DIR, file), "utf-8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (inQuotes) {
      if (c === '"') {
        if (data[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* ignore */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && r.some((v) => v !== ""));
}

// ── Helpers de normalisation ───────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitName(full: string): { first: string | null; last: string | null } {
  const clean = full.replace(/\s+/g, " ").trim();
  if (!clean || clean === ".") return { first: null, last: null };
  const parts = clean.split(" ");
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split("-");
  return `${y}-${m}-${d}`;
}

function toTime(hhmm: string): string {
  const t = hhmm.padStart(4, "0");
  return `${t.slice(0, 2)}:${t.slice(2)}`;
}

function minutes(hhmm: string): number {
  const t = hhmm.padStart(4, "0");
  return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(2), 10);
}

function parsePrice(s: string): number | null {
  const v = s.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Langue déduite du téléphone (Ville=France partout → défaut fr ; en si indicatif intl non-33)
function langFromPhone(phone: string): string {
  const p = phone.trim();
  if (!p) return "fr";
  const intl = p.replace(/[\s().-]/g, "");
  if (/^\+33/.test(intl) || /^0033/.test(intl) || /^33/.test(intl) || /^0/.test(intl)) return "fr";
  if (/^\+/.test(intl) || /^00/.test(intl)) return "en";
  return "fr";
}

function lifecycleStatus(isoDate: string, excelStatus: string): string {
  if (normalize(excelStatus) === "annule") return "cancelled";
  return isoDate < TODAY ? "completed" : "confirmed";
}

// ── Mapping paiement depuis la colonne « Statut » Excel ─────────────────────
interface PaymentMap {
  client_type: string;
  payment_method: string | null;
  payment_status: string | null;
}
function paymentFromStatus(excelStatus: string): PaymentMap {
  switch (normalize(excelStatus)) {
    case "offert":
      // sur bookings, 'offert' est un payment_method (pas un payment_status) → réglé/gratuit
      return { client_type: "external", payment_method: "offert", payment_status: "paid" };
    case "client hotel":
      return { client_type: "hotel", payment_method: "room", payment_status: "charged_to_room" };
    case "staycation":
      return { client_type: "staycation", payment_method: "partner_billed", payment_status: "pending_partner_billing" };
    case "sezame":
      return { client_type: "sezame", payment_method: "partner_billed", payment_status: "pending_partner_billing" };
    case "voucher lymfea":
      return { client_type: "external", payment_method: "voucher", payment_status: "paid" };
    case "voucher hotel":
      return { client_type: "external", payment_method: "voucher", payment_status: "paid" };
    default: // Demande en ligne, Confirmé, Envoyer lien de paiement, vide
      return { client_type: "external", payment_method: null, payment_status: "pending" };
  }
}

function guestCount(service: string): number {
  const n = normalize(service);
  if (n.includes("3 personnes")) return 3;
  if (n.includes("4 personnes")) return 4;
  // "Duo" explicite (hors "Solo ou Duo" ambigu → 1)
  if (/\bduo\b/.test(n) && !n.includes("solo ou duo")) return 2;
  return 1;
}

// ── Référentiels chargés depuis la base ─────────────────────────────────────
interface Refs {
  treatmentByName: Map<string, string>; // nom normalisé → treatment_id
  therapists: { id: string; first: string; full: string }[];
  existingCustomerByName: Map<string, string>; // nom normalisé → customer_id (clients Buci déjà en DB)
  existingBookingKeys: Set<string>; // `${date}|${time}` déjà en DB (cabine unique → 1 booking/créneau, robuste aux variantes de nom)
  existingAmenityKeys: Set<string>; // `${date}|${time}` déjà en DB
}

// Map des services Excel → nom DB du treatment (pour les lignes cabine)
// Alias de noms clients (variantes d'orthographe → nom déjà en prod), pour dédup
const NAME_ALIASES: Record<string, string> = {
  "nathalie goni": "natalie goni",
};

const SERVICE_TO_TREATMENT: Record<string, string> = {
  "le rituel de buci signature": "Kundalini Bliss — Rituel de l'Éveil ",
  "elixir secret": "Elixir Secret",
  "serenite parisienne": "Sérénité Parisienne",
  "les mysteres de buci": "Les Mystères de Buci",
  "massage lympho fascia ilse": "ILSE Lymphatic-Fascial Massage",
};

async function loadRefs(supabase: ReturnType<typeof createClient>): Promise<Refs> {
  const { data: treatments, error: tErr } = await supabase
    .from("treatment_menus")
    .select("id, name")
    .eq("hotel_id", HOTEL_ID);
  if (tErr) throw new Error(`treatment_menus: ${tErr.message}`);

  const treatmentByName = new Map<string, string>();
  for (const t of treatments ?? []) treatmentByName.set(normalize(t.name as string), t.id as string);

  const { data: tv, error: thErr } = await supabase
    .from("therapist_venues")
    .select("therapists(id, first_name, last_name)")
    .eq("hotel_id", HOTEL_ID);
  if (thErr) throw new Error(`therapist_venues: ${thErr.message}`);

  const therapists = (tv ?? [])
    .map((r) => r.therapists as { id: string; first_name: string; last_name: string } | null)
    .filter((t): t is { id: string; first_name: string; last_name: string } => !!t)
    .map((t) => ({
      id: t.id,
      first: normalize(t.first_name),
      full: `${t.first_name.trim()} ${t.last_name.trim()}`.trim(),
    }));

  // ── Dédup DB : bookings existants pour ce venue (import de juin déjà commité) ──
  const { data: exBookings, error: bErr } = await supabase
    .from("bookings")
    .select("customer_id, booking_date, booking_time")
    .eq("hotel_id", HOTEL_ID);
  if (bErr) throw new Error(`bookings (dédup): ${bErr.message}`);

  const { data: exAmenities, error: aErr } = await supabase
    .from("amenity_bookings")
    .select("customer_id, booking_date, booking_time")
    .eq("hotel_id", HOTEL_ID);
  if (aErr) throw new Error(`amenity_bookings (dédup): ${aErr.message}`);

  // customer_ids liés à ce venue → noms (pour dédup client par nom normalisé)
  const buciCustomerIds = new Set<string>();
  for (const b of exBookings ?? []) if (b.customer_id) buciCustomerIds.add(b.customer_id as string);
  for (const a of exAmenities ?? []) if (a.customer_id) buciCustomerIds.add(a.customer_id as string);

  const existingCustomerByName = new Map<string, string>();
  const ids = [...buciCustomerIds];
  for (let i = 0; i < ids.length; i += 300) {
    const { data: custs, error: cErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name")
      .in("id", ids.slice(i, i + 300));
    if (cErr) throw new Error(`customers (dédup): ${cErr.message}`);
    for (const c of custs ?? []) {
      const nn = normalize(`${c.first_name ?? ""} ${c.last_name ?? ""}`);
      if (nn) existingCustomerByName.set(nn, c.id as string);
    }
  }

  const existingBookingKeys = new Set<string>();
  for (const b of exBookings ?? []) {
    existingBookingKeys.add(`${b.booking_date}|${(b.booking_time as string)?.slice(0, 5)}`);
  }
  const existingAmenityKeys = new Set<string>();
  for (const a of exAmenities ?? []) {
    existingAmenityKeys.add(`${a.booking_date}|${(a.booking_time as string)?.slice(0, 5)}`);
  }

  return { treatmentByName, therapists, existingCustomerByName, existingBookingKeys, existingAmenityKeys };
}

// Réduit les lettres consécutives dupliquées (Annaelle → anaele = Anaëlle)
function collapse(s: string): string {
  return s.replace(/(.)\1+/g, "$1");
}

function resolveTherapist(
  employe: string,
  refs: Refs,
): { id: string | null; name: string | null; matched: boolean } {
  const n = normalize(employe);
  // vide (broadcast) ou placeholder de genre → null volontaire, considéré résolu
  if (!n || n.includes("women") || n.includes("man") || n.includes("femme") || n.includes("homme")) {
    return { id: null, name: null, matched: true };
  }
  const firstToken = n.split(" ")[0];
  const c = collapse(firstToken);
  const hit = refs.therapists.find((t) => {
    const tFirst = t.first.split(" ")[0];
    return tFirst === firstToken || t.first === n || collapse(tFirst) === c;
  });
  if (hit) return { id: hit.id, name: hit.full, matched: true };
  return { id: null, name: null, matched: false };
}

function resolveTreatment(service: string, refs: Refs): string | null {
  const dbName = SERVICE_TO_TREATMENT[normalize(service)];
  if (!dbName) return null;
  return refs.treatmentByName.get(normalize(dbName)) ?? null;
}

// ── CSV ──────────────────────────────────────────────────────────────────
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

// ── Types des lignes cibles ─────────────────────────────────────────────────
interface CustomerRow {
  key: string; // clé de dédup (nom normalisé)
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  language: string;
}

async function main() {
  const mode = process.argv.includes("--commit") ? "commit" : "dry-run";
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (source .env.prod.local).");
  }
  const supabase = createClient(supabaseUrl, serviceKey);
  const refs = await loadRefs(supabase);

  const report: string[] = [];
  const log = (m: string) => {
    report.push(m);
    process.stdout.write(m + "\n");
  };
  log(`Mode: ${mode} — DB: ${supabaseUrl}`);

  // 1) Clients depuis customers.csv (name,phone — pré-converti depuis « Client Buci1.xlsx »)
  const custRows = parseCsv("customers.csv").slice(1); // skip header
  const customers = new Map<string, CustomerRow>(); // key → row
  const nameToKey = new Map<string, string>(); // nom normalisé → key (pour join réservation)

  const upsertCustomer = (name: string, phone: string | null, langOverride?: string): string => {
    const { first, last } = splitName(name);
    const rawNorm = normalize(name);
    const normName = NAME_ALIASES[rawNorm] ?? rawNorm;
    const key = `n:${normName}`;
    const language = langOverride ?? langFromPhone(phone ?? "");
    if (!customers.has(key)) {
      customers.set(key, { key, first_name: first, last_name: last, phone: phone || null, language });
    } else {
      // compléter téléphone/nom manquants
      const ex = customers.get(key)!;
      if (!ex.phone && phone) ex.phone = phone;
      if (!ex.first_name && first) ex.first_name = first;
      if (!ex.last_name && last) ex.last_name = last;
    }
    if (normName) nameToKey.set(normName, key);
    return key;
  };

  for (const r of custRows) {
    const name = (r[0] ?? "").trim();
    const phone = (r[1] ?? "").trim() || null;
    if (!name) continue;
    upsertCustomer(name, phone);
  }
  log(`Clients fichier: ${customers.size} (sur ${custRows.length} lignes)`);

  // 2) Réservations
  const bookingRows = parseRows("Rdv Buci.xls").slice(1).filter((r) => r[0] !== "Total");
  log(`Réservations Excel: ${bookingRows.length}`);

  const bookingsOut: Record<string, unknown>[] = [];
  const amenitiesOut: Record<string, unknown>[] = [];
  const unmatchedTherapists = new Set<string>();
  const unmatchedTreatments = new Set<string>();
  let skippedBookings = 0;
  let skippedAmenities = 0;

  for (const r of bookingRows) {
    const [dateRaw, clientName, service, , employe, , room, startRaw, endRaw, excelStatus, priceRaw, remarques] = r;
    const isoDate = toIsoDate(dateRaw);
    const dur = minutes(endRaw) - minutes(startRaw);
    const price = parsePrice(priceRaw);
    const pay = paymentFromStatus(excelStatus);

    // lier la réservation à un client (join par nom ; sinon créer le client)
    const normName = NAME_ALIASES[normalize(clientName)] ?? normalize(clientName);
    let custKey = nameToKey.get(normName);
    if (!custKey) custKey = upsertCustomer(clientName, null, "fr");

    if (normalize(room).startsWith("bassin")) {
      // dédup DB : bassin déjà importé (même date+heure) → ignorer
      if (refs.existingAmenityKeys.has(`${isoDate}|${toTime(startRaw)}`)) { skippedAmenities++; continue; }
      // → amenity_bookings
      amenitiesOut.push({
        hotel_id: HOTEL_ID,
        venue_amenity_id: AMENITY_POOL_ID,
        booking_date: isoDate,
        booking_time: toTime(startRaw),
        duration: dur,
        end_time: toTime(endRaw) + ":00",
        customer_key: custKey,
        client_type: pay.client_type === "hotel" ? "internal" : pay.client_type === "sezame" ? "sezame" : "external",
        num_guests: guestCount(service),
        price,
        payment_status:
          pay.payment_method === "offert"
            ? "offert"
            : pay.payment_status === "pending" || pay.payment_status === "pending_partner_billing"
              ? "pending"
              : "paid",
        status: lifecycleStatus(isoDate, excelStatus),
        notes: [service, remarques].filter(Boolean).join(" — "),
      });
    } else {
      // dédup DB : cabine déjà réservée sur ce créneau (même date+heure) → ignorer
      if (refs.existingBookingKeys.has(`${isoDate}|${toTime(startRaw)}`)) { skippedBookings++; continue; }
      // → bookings (+ booking_treatments)
      const th = resolveTherapist(employe ?? "", refs);
      if (!th.matched) unmatchedTherapists.add(employe);
      const treatmentId = resolveTreatment(service, refs);
      if (!treatmentId) unmatchedTreatments.add(service);
      const { first, last } = splitName(clientName);
      const cust = customers.get(custKey)!;

      bookingsOut.push({
        hotel_id: HOTEL_ID,
        client_first_name: first ?? "Client",
        client_last_name: last ?? "",
        client_email: null,
        phone: cust.phone ?? "",
        booking_date: isoDate,
        booking_time: toTime(startRaw),
        duration: dur,
        total_price: price,
        room_id: ROOM_CABINE_ID,
        therapist_id: th.id,
        therapist_name: th.name,
        treatment_id: treatmentId,
        treatment_service: service,
        status: lifecycleStatus(isoDate, excelStatus),
        client_type: pay.client_type,
        payment_method: pay.payment_method,
        payment_status: pay.payment_status,
        language: cust.language,
        source: "migration",
        client_note: remarques || null,
        customer_key: custKey,
      });
    }
  }

  // Dédup clients : combien du fichier existent déjà en DB (par nom normalisé)
  const existingCustomers = [...customers.values()].filter((c) =>
    refs.existingCustomerByName.has(c.key.slice(2)),
  ).length;
  const newCustomers = customers.size - existingCustomers;

  log(`→ bookings (cabine): ${bookingsOut.length}`);
  log(`→ amenity_bookings (bassin): ${amenitiesOut.length}`);
  log(`→ customers totaux (fichier + réservations): ${customers.size}`);
  log(`   dont déjà en DB (dédup, non réinsérés): ${existingCustomers} | nouveaux: ${newCustomers}`);
  log(`Clients sans téléphone: ${[...customers.values()].filter((c) => !c.phone).length}`);
  if (skippedBookings || skippedAmenities)
    log(`Dédup DB — bookings ignorés: ${skippedBookings}, amenities ignorés: ${skippedAmenities}`);
  if (unmatchedTherapists.size) log(`⚠ Thérapeutes non résolus: ${[...unmatchedTherapists].join(", ")}`);
  if (unmatchedTreatments.size) log(`⚠ Soins non résolus (pas de lien): ${[...unmatchedTreatments].join(", ")}`);

  if (mode === "dry-run") {
    const customerCsv = [...customers.values()].map((c) => ({
      key: c.key,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      language: c.language,
      already_in_db: refs.existingCustomerByName.has(c.key.slice(2)) ? "yes" : "",
    }));
    writeFileSync(join(OUTPUT_DIR, "customers.csv"), toCsv(customerCsv));
    writeFileSync(join(OUTPUT_DIR, "bookings.csv"), toCsv(bookingsOut));
    writeFileSync(join(OUTPUT_DIR, "amenity_bookings.csv"), toCsv(amenitiesOut));
    writeFileSync(join(OUTPUT_DIR, "report.txt"), report.join("\n"));
    log(`\nCSV écrits dans ${OUTPUT_DIR}/`);
    return;
  }

  // ── COMMIT ────────────────────────────────────────────────────────────────
  await commit(supabase, refs, [...customers.values()], bookingsOut, amenitiesOut, log);
  writeFileSync(join(OUTPUT_DIR, "report.txt"), report.join("\n"));
}

async function commit(
  supabase: ReturnType<typeof createClient>,
  refs: Refs,
  customers: CustomerRow[],
  bookings: Record<string, unknown>[],
  amenities: Record<string, unknown>[],
  log: (m: string) => void,
) {
  const keyToId = new Map<string, string>();
  const inserted: { customers: string[]; bookings: string[]; amenity_bookings: string[] } = {
    customers: [],
    bookings: [],
    amenity_bookings: [],
  };
  const flushIds = () =>
    writeFileSync(join(OUTPUT_DIR, "inserted-ids.json"), JSON.stringify(inserted, null, 2));

  try {
  // 1) customers — dédup : lier les clients déjà en DB, n'insérer que les nouveaux
  const toInsert: CustomerRow[] = [];
  for (const c of customers) {
    const existingId = refs.existingCustomerByName.get(c.key.slice(2));
    if (existingId) keyToId.set(c.key, existingId);
    else toInsert.push(c);
  }
  log(`Clients déjà en DB (liés, non réinsérés): ${customers.length - toInsert.length}`);
  for (let i = 0; i < toInsert.length; i += 200) {
    const batch = toInsert.slice(i, i + 200);
    const { data, error } = await supabase
      .from("customers")
      .insert(
        batch.map((c) => ({
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
          language: c.language,
        })),
      )
      .select("id");
    if (error) throw new Error(`customers insert: ${error.message}`);
    (data ?? []).forEach((row, idx) => {
      keyToId.set(batch[idx].key, row.id as string);
      inserted.customers.push(row.id as string);
    });
    flushIds();
  }
  log(`✓ ${inserted.customers.length} customers insérés (nouveaux)`);

  // 2) bookings + booking_treatments
  let bookingCount = 0;
  for (const b of bookings) {
    const { customer_key, treatment_id, treatment_service, ...row } = b as Record<string, unknown>;
    const { data, error } = await supabase
      .from("bookings")
      .insert({ ...row, customer_id: keyToId.get(customer_key as string) ?? null })
      .select("id")
      .single();
    if (error) throw new Error(`booking insert (${treatment_service}): ${error.message}`);
    inserted.bookings.push(data.id as string);
    flushIds();
    if (treatment_id) {
      const { error: btErr } = await supabase
        .from("booking_treatments")
        .insert({ booking_id: data.id as string, treatment_id: treatment_id as string });
      if (btErr) throw new Error(`booking_treatments insert: ${btErr.message}`);
    }
    bookingCount++;
  }
  log(`✓ ${bookingCount} bookings insérés`);

  // 3) amenity_bookings
  let amenityCount = 0;
  for (const a of amenities) {
    const { customer_key, ...row } = a as Record<string, unknown>;
    const { data, error } = await supabase
      .from("amenity_bookings")
      .insert({ ...row, customer_id: keyToId.get(customer_key as string) ?? null })
      .select("id")
      .single();
    if (error) throw new Error(`amenity_booking insert: ${error.message}`);
    inserted.amenity_bookings.push(data.id as string);
    flushIds();
    amenityCount++;
  }
  log(`✓ ${amenityCount} amenity_bookings insérés`);
  } finally {
    flushIds();
  }
}

main().catch((e) => {
  process.stderr.write(`ERREUR: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
