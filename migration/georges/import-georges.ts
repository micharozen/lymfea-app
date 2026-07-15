/**
 * Migration des réservations historiques de l'Hôtel Monsieur George depuis les exports.
 *
 * - `Rdv George.xls` est en réalité une table HTML (liste de rendez-vous, même format que Buci/Hana).
 * - `Client George.ods` (OpenDocument) est pré-converti en `customers.csv` (colonnes name,phone) :
 *
 *     cd migration/georges && python3 - <<'PY'
 *     import zipfile, xml.etree.ElementTree as ET, csv
 *     NS='{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'
 *     root=ET.fromstring(zipfile.ZipFile('Client George.ods').read('content.xml').decode('utf-8'))
 *     rows=[]
 *     for tr in root.iter(NS+'table-row'):
 *         cells=[]
 *         for tc in tr.findall(NS+'table-cell'):
 *             rep=int(tc.get(NS+'number-columns-repeated','1')); cells+=[''.join(tc.itertext())]*rep
 *         while cells and cells[-1]=='': cells.pop()
 *         if cells: rows.append(cells)
 *     h=rows[0]; iN=h.index('client'); iTel=h.index('Téléphone'); iFix=h.index('Téléphone fixe#'); iMob=h.index('Mobile#')
 *     def np(v):
 *         s=''.join(ch for ch in str(v or '').split('.')[0] if ch.isdigit() or ch=='+')
 *         if not s: return ''
 *         if s.startswith('+'): return s
 *         if s.startswith('0033'): return '+'+s[2:]
 *         if s.startswith('33') and len(s)>=11: return '+'+s
 *         if s.startswith('0') and len(s)==10: return '+33'+s[1:]
 *         if len(s)==9: return '+33'+s
 *         return '+'+s
 *     out=[((r[iN] if iN<len(r) else '').strip(), np(r[iMob] if iMob<len(r) else '') or np(r[iTel] if iTel<len(r) else '') or np(r[iFix] if iFix<len(r) else '')) for r in rows[1:] if (r[iN] if iN<len(r) else '').strip()]
 *     csv.writer(open('customers.csv','w',newline='',encoding='utf-8')).writerows([['name','phone'],*out])
 *     PY
 *
 * Le lieu Georges n'a que 2 cabines (pas de piscine/bassin) → chaque ligne = 1 booking.
 * Le dry-run/commit déduplique clients + bookings contre la prod (bookings déjà saisis en
 * direct dans l'app) pour rester idempotent.
 *
 * Usage:
 *   bun migration/georges/import-georges.ts --dry-run   → écrit les CSV dans output/, aucune écriture DB
 *   bun migration/georges/import-georges.ts --commit    → insère (customers → bookings/booking_treatments)
 *
 * Requiert SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (cf. .env.prod.local) :
 *   set -a && source .env.prod.local && set +a && bun migration/georges/import-georges.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ── Constantes du venue (PROD, Hôtel Monsieur George) ──────────────────────
const HOTEL_ID = "81faa6b1-bcff-4f29-865a-df354f456eb8";

// Salle Excel (normalisée) → treatment_room id
const ROOMS: Record<string, string> = {
  "cabine 1": "23859807-bdb6-4ec9-8389-c82d91315f10",
  "cabine 2": "aeaf365b-a788-403b-a843-6abe43b32523",
};

// Service Excel (normalisé) → treatment_menu id (Hôtel Monsieur George)
// Note : « Massage lympho-fascia ILSE » n'existe pas au menu Georges → non lié (rapporté).
const SERVICE_TO_TREATMENT: Record<string, string> = {
  "relaxation intense": "dafcc717-2952-4fa7-8953-18cabdc56972",
  "force tranquille": "5e81320c-d887-42e0-bb77-d206675fc50f",
  "detox vitalite": "70509cfd-3e35-4cc3-9ea2-c615796d2951",
  "visage liftant": "c6fc2ae5-3fe5-4c28-aa31-1d40ed88202d",
};

const MIGRATION_DIR = join(import.meta.dir);
const OUTPUT_DIR = join(MIGRATION_DIR, "output");
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ── Parsing HTML des .xls ──────────────────────────────────────────────────
function parseRows(file: string): string[][] {
  const data = readFileSync(join(MIGRATION_DIR, file), "utf-8").replace(/^﻿/, "");
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
    .replace(/[̀-ͯ]/g, "")
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
  const v = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Langue déduite du téléphone (Ville=France majoritaire → défaut fr ; en si indicatif intl non-33)
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
    case "staycation":
      return { client_type: "staycation", payment_method: "partner_billed", payment_status: "pending_partner_billing" };
    case "offert":
      return { client_type: "external", payment_method: "offert", payment_status: "offert" };
    case "client hotel paiement chambre":
      return { client_type: "hotel", payment_method: "room", payment_status: "charged_to_room" };
    case "lien de paiement recu":
      return { client_type: "external", payment_method: "card", payment_status: "paid" };
    case "lien de paiement envoye":
      return { client_type: "external", payment_method: null, payment_status: "awaiting_payment" };
    case "voucher lymfea":
    case "voucher hotel":
      return { client_type: "external", payment_method: "voucher", payment_status: "paid" };
    default: // Online Requests, vide
      return { client_type: "external", payment_method: null, payment_status: "pending" };
  }
}

// ── Référentiels chargés depuis la base ─────────────────────────────────────
interface Refs {
  therapists: { id: string; first: string; full: string }[];
  existingCustomerByName: Map<string, string>; // nom normalisé → customer_id (clients Georges déjà en DB)
  existingCustomerByPhone: Map<string, string>; // téléphone → customer_id (contrainte unique customers.phone) — rempli dans main()
  existingBookingKeys: Set<string>; // `${date}|${time}|${room_id}` déjà en DB (2 cabines → room-aware)
}

async function loadRefs(supabase: ReturnType<typeof createClient>): Promise<Refs> {
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
      full: `${t.first_name.trim()} ${(t.last_name ?? "").trim()}`.trim(),
    }));

  // ── Dédup DB : bookings existants pour ce venue (saisies en direct dans l'app) ──
  const { data: exBookings, error: bErr } = await supabase
    .from("bookings")
    .select("customer_id, booking_date, booking_time, room_id")
    .eq("hotel_id", HOTEL_ID);
  if (bErr) throw new Error(`bookings (dédup): ${bErr.message}`);

  const georgesCustomerIds = new Set<string>();
  for (const b of exBookings ?? []) if (b.customer_id) georgesCustomerIds.add(b.customer_id as string);

  const existingCustomerByName = new Map<string, string>();
  const ids = [...georgesCustomerIds];
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
    existingBookingKeys.add(`${b.booking_date}|${(b.booking_time as string)?.slice(0, 5)}|${b.room_id ?? "none"}`);
  }

  return { therapists, existingCustomerByName, existingCustomerByPhone: new Map(), existingBookingKeys };
}

// Résout l'id d'un client déjà en DB : par nom normalisé, sinon par téléphone (unique)
function resolveExistingCustomerId(c: CustomerRow, refs: Refs): string | undefined {
  return refs.existingCustomerByName.get(c.key.slice(2)) ?? (c.phone ? refs.existingCustomerByPhone.get(c.phone) : undefined);
}

// Réduit les lettres consécutives dupliquées (Anaelle → anaele = Anaëlle)
function collapse(s: string): string {
  return s.replace(/(.)\1+/g, "$1");
}

function resolveTherapist(
  employe: string,
  refs: Refs,
): { id: string | null; name: string | null; matched: boolean } {
  const n = normalize(employe);
  // vide (broadcast) ou placeholder de genre → null volontaire, considéré résolu
  if (!n || n.includes("women") || n.includes("ladies") || n.includes("man") || n.includes("femme") || n.includes("homme")) {
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

function resolveTreatment(service: string): string | null {
  return SERVICE_TO_TREATMENT[normalize(service)] ?? null;
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

  // 1) Clients depuis customers.csv (name,phone — pré-converti depuis « Client George.ods »)
  const custRows = parseCsv("customers.csv").slice(1); // skip header
  const customers = new Map<string, CustomerRow>();
  const nameToKey = new Map<string, string>();

  const upsertCustomer = (name: string, phone: string | null, langOverride?: string): string => {
    const { first, last } = splitName(name);
    const normName = normalize(name);
    const key = `n:${normName}`;
    const language = langOverride ?? langFromPhone(phone ?? "");
    if (!customers.has(key)) {
      customers.set(key, { key, first_name: first, last_name: last, phone: phone || null, language });
    } else {
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
  const bookingRows = parseRows("Rdv George.xls").slice(1).filter((r) => r[0] !== "Total");
  log(`Réservations Excel: ${bookingRows.length}`);

  const bookingsOut: Record<string, unknown>[] = [];
  const unmatchedTherapists = new Set<string>();
  const unmatchedTreatments = new Set<string>();
  let skippedBookings = 0;

  for (const r of bookingRows) {
    const [dateRaw, clientName, service, , employe, , room, startRaw, endRaw, excelStatus, priceRaw, remarques] = r;
    const isoDate = toIsoDate(dateRaw);
    const price = parsePrice(priceRaw);
    const pay = paymentFromStatus(excelStatus);
    const normRoom = normalize(room);
    const roomId = ROOMS[normRoom] ?? null;

    // dédup DB : booking déjà en base (même date+heure+salle) → ignorer
    if (refs.existingBookingKeys.has(`${isoDate}|${toTime(startRaw)}|${roomId ?? "none"}`)) { skippedBookings++; continue; }

    // lier la réservation à un client (join par nom ; sinon créer le client)
    const normName = normalize(clientName);
    let custKey = nameToKey.get(normName);
    if (!custKey) custKey = upsertCustomer(clientName, null, "fr");
    const cust = customers.get(custKey)!;

    const th = resolveTherapist(employe ?? "", refs);
    if (!th.matched) unmatchedTherapists.add(employe);
    const treatmentId = resolveTreatment(service);
    if (!treatmentId) unmatchedTreatments.add(service);
    const { first, last } = splitName(clientName);
    const dur = minutes(endRaw) - minutes(startRaw);

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
      room_id: roomId,
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

  // Dédup par téléphone (contrainte unique customers.phone) : lier au client existant même si le nom diffère
  const filePhones = [...new Set([...customers.values()].map((c) => c.phone).filter((p): p is string => !!p))];
  for (let i = 0; i < filePhones.length; i += 200) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, phone")
      .in("phone", filePhones.slice(i, i + 200));
    if (error) throw new Error(`customers phone dédup: ${error.message}`);
    for (const c of data ?? []) refs.existingCustomerByPhone.set(c.phone as string, c.id as string);
  }

  // Dédup clients : combien du fichier existent déjà en DB (par nom OU téléphone)
  const existingCustomers = [...customers.values()].filter((c) => resolveExistingCustomerId(c, refs)).length;

  log(`→ bookings: ${bookingsOut.length}`);
  log(`→ customers totaux (fichier + réservations): ${customers.size}`);
  log(`   dont déjà en DB (dédup nom/tél, non réinsérés): ${existingCustomers} | nouveaux: ${customers.size - existingCustomers}`);
  log(`Clients sans téléphone: ${[...customers.values()].filter((c) => !c.phone).length}`);
  if (skippedBookings) log(`Dédup DB — bookings déjà en base ignorés: ${skippedBookings}`);
  if (unmatchedTherapists.size) log(`⚠ Thérapeutes non résolus: ${[...unmatchedTherapists].join(", ")}`);
  if (unmatchedTreatments.size) log(`⚠ Soins non résolus (pas de lien): ${[...unmatchedTreatments].join(", ")}`);

  if (mode === "dry-run") {
    const customerCsv = [...customers.values()].map((c) => ({
      key: c.key,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      language: c.language,
      already_in_db: resolveExistingCustomerId(c, refs) ? "yes" : "",
    }));
    const bookingCsv = bookingsOut;
    writeFileSync(join(OUTPUT_DIR, "customers.csv"), toCsv(customerCsv));
    writeFileSync(join(OUTPUT_DIR, "bookings.csv"), toCsv(bookingCsv));
    writeFileSync(join(OUTPUT_DIR, "report.txt"), report.join("\n"));
    log(`\nCSV écrits dans ${OUTPUT_DIR}/`);
    return;
  }

  // ── COMMIT ────────────────────────────────────────────────────────────────
  await commit(supabase, refs, [...customers.values()], bookingsOut, log);
  writeFileSync(join(OUTPUT_DIR, "report.txt"), report.join("\n"));
}

async function commit(
  supabase: ReturnType<typeof createClient>,
  refs: Refs,
  customers: CustomerRow[],
  bookings: Record<string, unknown>[],
  log: (m: string) => void,
) {
  const keyToId = new Map<string, string>();
  const inserted: { customers: string[]; bookings: string[] } = { customers: [], bookings: [] };
  const flushIds = () =>
    writeFileSync(join(OUTPUT_DIR, "inserted-ids.json"), JSON.stringify(inserted, null, 2));

  try {
    // 1) customers — dédup : lier les clients déjà en DB, n'insérer que les nouveaux
    const toInsert: CustomerRow[] = [];
    for (const c of customers) {
      const existingId = resolveExistingCustomerId(c, refs);
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
  } finally {
    flushIds();
  }
}

main().catch((e) => {
  process.stderr.write(`ERREUR: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
