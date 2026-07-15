/**
 * Migration des réservations historiques de l'Hôtel Hana depuis les exports.
 *
 * - `hana/bookings.xls` est en réalité une table HTML (même format que Buci).
 * - `hana/customers.ods` est un OpenDocument ; on le pré-convertit en `hana/customers.csv`
 *   (colonnes name,phone) via python3 :
 *
 *     cd migration/hana && python3 - <<'PY'
 *     import zipfile, xml.etree.ElementTree as ET, csv
 *     NS='{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'
 *     root=ET.fromstring(zipfile.ZipFile('customers.ods').read('content.xml').decode('utf-8'))
 *     rows=[]
 *     for tr in root.iter(NS+'table-row'):
 *         cells=[]
 *         for tc in tr.findall(NS+'table-cell'):
 *             rep=int(tc.get(NS+'number-columns-repeated','1')); cells+=[''.join(tc.itertext())]*rep
 *         while cells and cells[-1]=='': cells.pop()
 *         if cells: rows.append(cells)
 *     h=rows[0]; iN,iT,iM=h.index('client'),h.index('Téléphone'),h.index('Mobile#')
 *     out=[(r[iN].strip(), (r[iM].strip() if iM<len(r) else '') or (r[iT].strip() if iT<len(r) else '')) for r in rows[1:] if r and r[iN].strip()]
 *     csv.writer(open('customers.csv','w',newline='',encoding='utf-8')).writerows([['name','phone'],*out])
 *     PY
 *
 * Usage:
 *   bun migration/import-hana.ts --dry-run   → écrit les CSV dans migration/hana/output/, aucune écriture DB
 *   bun migration/import-hana.ts --commit    → insère (customers → bookings/booking_treatments → amenity_bookings)
 *
 * Requiert SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (cf. .env.prod.local) :
 *   set -a && source .env.prod.local && set +a && bun migration/import-hana.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ── Constantes du venue (PROD, Hôtel Hana) ─────────────────────────────────
const HOTEL_ID = "0588acce-dad1-4ec4-910c-7d2d5db5dc4d";
const AMENITY_POOL_ID = "bfb83551-ff28-4fcf-8dbe-d48755cd373e";

// Salle Excel (normalisée) → treatment_room id
const ROOMS: Record<string, string> = {
  "cabine 1": "3d49e0df-e19c-4abd-a2e8-c9e95cd53c6b",
  "cabine 2": "53fdb48e-91f5-472c-8ce5-6ab88a764661",
};

// Service Excel (normalisé) → treatment_menu id (Hôtel Hana)
const SERVICE_TO_TREATMENT: Record<string, string> = {
  "harmonie du corps ki": "3e03b797-62dd-49a2-bc0d-6772d2acbb55",
  "rituel kobido biyo": "e4847910-3f9d-4903-96a1-eeac2c9a55c0",
  "kamiyu rituel sacre du cheveu": "1c95dde6-35ed-4756-b609-8619b8390d70",
  "detox corps joka": "590be487-caf7-4ede-b5ad-5f0ef5b205cc",
  "oto flow le sound healing piscine solo ou duo": "07b737d4-c029-4150-84d9-a511c3ae33ba",
  "femme enceinte ninpu": "33ee4b5e-03fb-4939-9baf-63f0996041bf",
  "harmonie du ventre hara": "68aff08b-c1d6-4a5b-88b0-28d36edc83d0",
  "drainage ilse": "801a34db-f0d3-4a93-b9b2-c64194fb167b",
  "massage lympho fascia ilse": "801a34db-f0d3-4a93-b9b2-c64194fb167b",
  "tete mains pieds sentan": "4dc8487f-68a9-44e8-b645-a0394b29838e",
};

const MIGRATION_DIR = join(import.meta.dir);
const HANA_DIR = MIGRATION_DIR; // le script vit dans migration/hana/
const OUTPUT_DIR = join(HANA_DIR, "output");
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ── Parsing HTML des .xls ──────────────────────────────────────────────────
function parseRows(file: string): string[][] {
  const data = readFileSync(join(HANA_DIR, file), "utf-8").replace(/^﻿/, "");
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
  const data = readFileSync(join(HANA_DIR, file), "utf-8").replace(/^﻿/, "");
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

function timeFromMin(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60);
  const min = mm % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parsePrice(s: string): number | null {
  const v = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
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
    case "staycation":
      return { client_type: "staycation", payment_method: "partner_billed", payment_status: "pending_partner_billing" };
    case "offert":
      return { client_type: "external", payment_method: "offert", payment_status: "offert" };
    case "client hotel paiement chambre":
      return { client_type: "hotel", payment_method: "room", payment_status: "charged_to_room" };
    case "paiement recu":
      return { client_type: "external", payment_method: "card", payment_status: "paid" };
    case "voucher lymfea":
      return { client_type: "external", payment_method: "voucher", payment_status: "paid" };
    case "voucher hotel":
      return { client_type: "external", payment_method: "voucher", payment_status: "paid" };
    case "lien de paiement envoye":
      return { client_type: "external", payment_method: null, payment_status: "awaiting_payment" };
    case "forfait":
      return { client_type: "external", payment_method: null, payment_status: "paid" };
    case "paiement sur place":
      return { client_type: "external", payment_method: "card", payment_status: "paid" };
    default: // Online Requests, vide
      return { client_type: "external", payment_method: null, payment_status: "pending" };
  }
}

// client_type booking → client_type amenity (CHECK: external/internal/lymfea/sezame)
function amenityClientType(bookingClientType: string): string {
  if (bookingClientType === "hotel") return "internal";
  if (bookingClientType === "sezame") return "sezame";
  return "external";
}

// ── Détection piscine depuis les remarques ──────────────────────────────────
interface PoolSpec {
  when: "before" | "after";
  duration: number;
}
function detectPool(remarques: string): PoolSpec | null {
  const n = normalize(remarques);
  if (!n.includes("piscine") && !n.includes("pisicne")) return null;
  if (n.includes("pas de piscine") || n.includes("en attente piscine")) return null;
  const durMatch = n.match(/(\d+)\s*min/);
  const duration = durMatch ? parseInt(durMatch[1], 10) : 60;
  const when: "before" | "after" = n.includes("avant") ? "before" : "after";
  return { when, duration };
}

// ── Référentiels chargés depuis la base ─────────────────────────────────────
interface Refs {
  therapists: { id: string; first: string; full: string }[];
  existingCustomerByName: Map<string, string>; // nom normalisé → customer_id (clients Hana déjà en DB)
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

  // ── Dédup DB : bookings existants pour ce venue (import de juin déjà commité) ──
  const { data: exBookings, error: bErr } = await supabase
    .from("bookings")
    .select("customer_id, booking_date, booking_time, room_id")
    .eq("hotel_id", HOTEL_ID);
  if (bErr) throw new Error(`bookings (dédup): ${bErr.message}`);

  const { data: exAmenities, error: aErr } = await supabase
    .from("amenity_bookings")
    .select("customer_id")
    .eq("hotel_id", HOTEL_ID);
  if (aErr) throw new Error(`amenity_bookings (dédup): ${aErr.message}`);

  const hanaCustomerIds = new Set<string>();
  for (const b of exBookings ?? []) if (b.customer_id) hanaCustomerIds.add(b.customer_id as string);
  for (const a of exAmenities ?? []) if (a.customer_id) hanaCustomerIds.add(a.customer_id as string);

  const existingCustomerByName = new Map<string, string>();
  const ids = [...hanaCustomerIds];
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
    existingBookingKeys.add(`${b.booking_date}|${(b.booking_time as string)?.slice(0, 5)}|${b.room_id ?? "pool"}`);
  }

  return { therapists, existingCustomerByName, existingBookingKeys };
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
  key: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  language: string;
}

interface PoolAmenity {
  venue_amenity_id: string;
  booking_date: string;
  booking_time: string;
  duration: number;
  end_time: string;
  num_guests: number;
  price: number;
  payment_status: string;
  client_type: string;
  status: string;
  notes: string;
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

  // 1) Clients depuis customers.csv (name,phone)
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
  const bookingRows = parseRows("Rdv Hana.xls").slice(1).filter((r) => r[0] !== "Total");
  log(`Réservations Excel: ${bookingRows.length}`);

  const bookingsOut: Record<string, unknown>[] = [];
  const unmatchedTherapists = new Set<string>();
  const unmatchedTreatments = new Set<string>();
  let poolCount = 0;
  let skippedBookings = 0;
  const poolSeen = new Set<string>(); // piscine partagée d'un duo = 1 seule commodité (pas 1 par cabine)

  for (const r of bookingRows) {
    const [dateRaw, clientName, service, , employe, , room, startRaw, endRaw, excelStatus, priceRaw, remarques] = r;
    const isoDate = toIsoDate(dateRaw);
    const price = parsePrice(priceRaw);
    const pay = paymentFromStatus(excelStatus);
    const normRoom = normalize(room);

    // dédup DB : booking déjà en base (même date+heure+salle) → ignorer (avec sa piscine liée)
    const dedupRoom = normRoom.startsWith("piscine") ? "pool" : ROOMS[normRoom] ?? "pool";
    if (refs.existingBookingKeys.has(`${isoDate}|${toTime(startRaw)}|${dedupRoom}`)) { skippedBookings++; continue; }

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

    const isPoolRoom = normRoom.startsWith("piscine");
    const roomId = isPoolRoom ? null : ROOMS[normRoom] ?? null;
    const dur = minutes(endRaw) - minutes(startRaw);

    // amenity piscine liée : soit la salle EST la piscine (Oto Flow), soit remarque « piscine avant/après »
    let poolAmenity: PoolAmenity | null = null;
    const poolSpec = detectPool(remarques ?? "");
    if (isPoolRoom) {
      // créneau = celui du soin
      poolAmenity = {
        venue_amenity_id: AMENITY_POOL_ID,
        booking_date: isoDate,
        booking_time: toTime(startRaw),
        duration: dur,
        end_time: toTime(endRaw) + ":00",
        num_guests: 1,
        price: 0, // le CA est porté par le booking Oto Flow, pas par l'amenity liée
        payment_status: "paid",
        client_type: amenityClientType(pay.client_type),
        status: lifecycleStatus(isoDate, excelStatus),
        notes: [service, remarques].filter(Boolean).join(" — "),
      };
    } else if (poolSpec) {
      const startMin =
        poolSpec.when === "before" ? minutes(startRaw) - poolSpec.duration : minutes(endRaw);
      const endMin = startMin + poolSpec.duration;
      poolAmenity = {
        venue_amenity_id: AMENITY_POOL_ID,
        booking_date: isoDate,
        booking_time: timeFromMin(startMin),
        duration: poolSpec.duration,
        end_time: timeFromMin(endMin) + ":00",
        num_guests: 1,
        price: 0,
        payment_status: "paid",
        client_type: amenityClientType(pay.client_type),
        status: lifecycleStatus(isoDate, excelStatus),
        notes: `Piscine (${poolSpec.when === "before" ? "avant" : "après"})` + (remarques ? ` — ${remarques}` : ""),
      };
    }
    // piscine partagée (duo sur 2 cabines) → ne créer la commodité qu'une fois par créneau
    if (poolAmenity) {
      const pk = `${poolAmenity.booking_date}|${poolAmenity.booking_time}|${poolAmenity.duration}`;
      if (poolSeen.has(pk)) poolAmenity = null;
      else poolSeen.add(pk);
    }
    if (poolAmenity) poolCount++;

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
      pool_amenity: poolAmenity,
    });
  }

  // Dédup clients : combien du fichier existent déjà en DB (par nom normalisé)
  const existingCustomers = [...customers.values()].filter((c) =>
    refs.existingCustomerByName.has(c.key.slice(2)),
  ).length;

  log(`→ bookings: ${bookingsOut.length}`);
  log(`→ amenity_bookings (piscine): ${poolCount}`);
  log(`→ customers totaux (fichier + réservations): ${customers.size}`);
  log(`   dont déjà en DB (dédup, non réinsérés): ${existingCustomers} | nouveaux: ${customers.size - existingCustomers}`);
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
      already_in_db: refs.existingCustomerByName.has(c.key.slice(2)) ? "yes" : "",
    }));
    const amenityCsv = bookingsOut
      .filter((b) => b.pool_amenity)
      .map((b) => {
        const a = b.pool_amenity as PoolAmenity;
        return {
          booking_client: `${b.client_first_name} ${b.client_last_name}`,
          booking_date: a.booking_date,
          booking_time: a.booking_time,
          end_time: a.end_time,
          duration: a.duration,
          client_type: a.client_type,
          price: a.price,
          payment_status: a.payment_status,
          status: a.status,
          notes: a.notes,
        };
      });
    const bookingCsv = bookingsOut.map(({ pool_amenity, ...b }) => b);
    writeFileSync(join(OUTPUT_DIR, "customers.csv"), toCsv(customerCsv));
    writeFileSync(join(OUTPUT_DIR, "bookings.csv"), toCsv(bookingCsv));
    writeFileSync(join(OUTPUT_DIR, "amenity_bookings.csv"), toCsv(amenityCsv));
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

    // 2) bookings + booking_treatments + amenity_bookings liés
    let bookingCount = 0;
    let amenityCount = 0;
    for (const b of bookings) {
      const { customer_key, treatment_id, treatment_service, pool_amenity, ...row } = b as Record<string, unknown>;
      const customerId = keyToId.get(customer_key as string) ?? null;
      const { data, error } = await supabase
        .from("bookings")
        .insert({ ...row, customer_id: customerId })
        .select("id")
        .single();
      if (error) throw new Error(`booking insert (${treatment_service}): ${error.message}`);
      const bookingId = data.id as string;
      inserted.bookings.push(bookingId);
      flushIds();

      if (treatment_id) {
        const { error: btErr } = await supabase
          .from("booking_treatments")
          .insert({ booking_id: bookingId, treatment_id: treatment_id as string });
        if (btErr) throw new Error(`booking_treatments insert: ${btErr.message}`);
      }

      if (pool_amenity) {
        const a = pool_amenity as PoolAmenity;
        const { data: aData, error: aErr } = await supabase
          .from("amenity_bookings")
          .insert({ ...a, hotel_id: HOTEL_ID, customer_id: customerId, linked_booking_id: bookingId })
          .select("id")
          .single();
        if (aErr) throw new Error(`amenity_booking insert: ${aErr.message}`);
        inserted.amenity_bookings.push(aData.id as string);
        flushIds();
        amenityCount++;
      }
      bookingCount++;
    }
    log(`✓ ${bookingCount} bookings insérés`);
    log(`✓ ${amenityCount} amenity_bookings insérés`);
  } finally {
    flushIds();
  }
}

main().catch((e) => {
  process.stderr.write(`ERREUR: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
