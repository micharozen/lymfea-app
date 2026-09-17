/**
 * Seeds the local "Paniers abandonnés" page with a realistic funnel, so the
 * admin screen can be captured for the landing page.
 * Run: bun scripts/seed-checkout-intents-local.mts
 *
 * Carts are built from the venue's real treatment variants (get_public_treatments),
 * not from hand-written prices, so the snapshots match what the app would store.
 * Re-running the script replaces the seeded rows (fixed UUIDs), nothing else.
 *
 * Four schema constraints drive the shape of this seed:
 *   1. `idx_checkout_intents_one_open_per_customer_hotel` allows a single open
 *      intent per (customer, venue) — hence one dedicated customer per cart.
 *   2. `isImmediateConversion` (src/pages/admin/CheckoutIntents.tsx) drops every
 *      intent converted under an hour from the list *and* from the KPIs, so the
 *      converted ones are dated two days after their creation.
 *   3. The page defaults to the last 30 days: every `created_at` sits inside it.
 *   4. `customers.organization_id` is NOT NULL and the page is org-scoped, so
 *      customers must belong to the venue's organization to show up at all.
 */

const DB_CONTAINER = "supabase_db_xfkujlgettlxdgrnqluw";

// supabase/seed.sql
const HANA = "00000000-0000-0000-0000-000000000010";

/** Conversion rate rendered by the donut: round(converted / total * 100). */
const TOTAL_CARTS = 20;
const CONVERTED_CARTS = 3;
/** Abandoned carts that already received at least one reminder email. */
const REMINDED_CARTS = 12;

interface SeedClient {
  firstName: string;
  lastName: string;
  email: string;
  /** Days before today the cart was created. */
  daysAgo: number;
  /** Local time of day the cart was abandoned, HH:MM. */
  at: string;
  roomNumber?: string;
}

// Adresses volontairement composées (initiale, chiffre) : elles doivent rester
// crédibles sur une capture publique sans risquer de viser une boîte réelle.
const CLIENTS: SeedClient[] = [
  { firstName: "Camille", lastName: "Aubriot", email: "c.aubriot91@orange.fr", daysAgo: 27, at: "10:12", roomNumber: "204" },
  { firstName: "Thomas", lastName: "Vasseur", email: "tvasseur.pro@free.fr", daysAgo: 26, at: "18:47" },
  { firstName: "Léa", lastName: "Marchetti", email: "lea.marchetti7@icloud.com", daysAgo: 24, at: "09:35", roomNumber: "117" },
  { firstName: "Nicolas", lastName: "Deschamps", email: "n.deschamps62@laposte.net", daysAgo: 23, at: "21:08" },
  { firstName: "Sophie", lastName: "Kerbrat", email: "s.kerbrat.paris@orange.fr", daysAgo: 21, at: "14:22" },
  { firstName: "Julien", lastName: "Ferrand", email: "julien.ferrand48@free.fr", daysAgo: 20, at: "11:05", roomNumber: "308" },
  { firstName: "Marine", lastName: "Lecomte", email: "m.lecomte.83@icloud.com", daysAgo: 19, at: "16:54" },
  { firstName: "Antoine", lastName: "Rivoire", email: "a.rivoire@laposte.net", daysAgo: 18, at: "08:41" },
  { firstName: "Claire", lastName: "Bonnefoy", email: "claire.bonnefoy26@orange.fr", daysAgo: 16, at: "19:30", roomNumber: "412" },
  { firstName: "Hugo", lastName: "Tassin", email: "h.tassin.mail@free.fr", daysAgo: 15, at: "13:17" },
  { firstName: "Émilie", lastName: "Garnier", email: "e.garnier57@icloud.com", daysAgo: 14, at: "17:02" },
  { firstName: "Romain", lastName: "Delaunay", email: "r.delaunay.pro@laposte.net", daysAgo: 12, at: "10:48", roomNumber: "221" },
  { firstName: "Alice", lastName: "Chevrier", email: "a.chevrier34@orange.fr", daysAgo: 11, at: "20:15" },
  { firstName: "Maxime", lastName: "Pouliquen", email: "m.pouliquen@free.fr", daysAgo: 9, at: "12:33" },
  { firstName: "Charlotte", lastName: "Vidalenc", email: "c.vidalenc19@icloud.com", daysAgo: 8, at: "15:26", roomNumber: "105" },
  { firstName: "Benoît", lastName: "Sarrazin", email: "b.sarrazin72@laposte.net", daysAgo: 6, at: "09:04" },
  { firstName: "Inès", lastName: "Haddad", email: "ines.haddad38@orange.fr", daysAgo: 5, at: "18:12" },
  { firstName: "Pierre", lastName: "Louvel", email: "p.louvel.mail@free.fr", daysAgo: 4, at: "11:39", roomNumber: "319" },
  { firstName: "Manon", lastName: "Estève", email: "m.esteve64@icloud.com", daysAgo: 3, at: "16:20" },
  { firstName: "Victor", lastName: "Alvarez", email: "v.alvarez.pro@laposte.net", daysAgo: 2, at: "14:05" },
];

/** One cart per client, as an index into the variant list loaded from the DB. */
interface CartPlan {
  /** Variant indexes making up the cart. Two entries means two treatments. */
  variants: number[];
  /** Days after creation the guest came back and booked. Absent = abandoned. */
  convertedAfterDays?: number;
}

// 3 conversions sur 20 = 15 %. Chacune est datée de deux jours après le panier :
// sous une heure, `isImmediateConversion` les exclurait du calcul.
const CART_PLANS: CartPlan[] = [
  { variants: [4] },
  { variants: [0] },
  { variants: [6], convertedAfterDays: 2 },
  { variants: [7, 3] },
  { variants: [5] },
  { variants: [1] },
  { variants: [4, 3] },
  { variants: [2] },
  { variants: [6] },
  { variants: [0, 7] },
  { variants: [5], convertedAfterDays: 2 },
  { variants: [3] },
  { variants: [4] },
  { variants: [1, 3] },
  { variants: [7] },
  { variants: [2] },
  { variants: [6], convertedAfterDays: 2 },
  { variants: [0] },
  { variants: [5, 7] },
  { variants: [4] },
];

// ── ids ──────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const customerId = (i: number) => `c1000000-0000-0000-0000-0000000000${pad(i)}`;
const intentId = (i: number) => `d1000000-0000-0000-0000-0000000000${pad(i)}`;

// ── db ───────────────────────────────────────────────────────────────────────

async function psql(sql: string): Promise<string> {
  const proc = Bun.spawn(
    ["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { stdin: new TextEncoder().encode(sql), stdout: "pipe", stderr: "pipe" },
  );
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if ((await proc.exited) !== 0) throw new Error(`psql failed: ${err || out}`);
  return out.trim();
}

function sqlQuote(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

interface VariantRef {
  treatmentId: string;
  treatmentName: string;
  variantId: string;
  variantLabel: string;
  price: number;
  guestCount: number;
}

/** Real bookable variants of the venue, so carts hold prices the app would store. */
async function loadVariants(hotelId: string): Promise<VariantRef[]> {
  const rows = await psql(`
    select coalesce(json_agg(json_build_object(
      'treatmentId', t.id, 'treatmentName', t.name,
      'variantId', v->>'id', 'variantLabel', v->>'label',
      'price', (v->>'price')::numeric, 'guestCount', coalesce((v->>'guest_count')::int, 1)
    ) order by t.name, (v->>'sort_order')::int), '[]'::json)
    from get_public_treatments(${sqlQuote(hotelId)}) t,
         lateral jsonb_array_elements(t.variants) v
    where t.is_addon = false
      and coalesce((v->>'price_on_request')::boolean, false) = false
      and (v->>'price') is not null;
  `);
  return JSON.parse(rows) as VariantRef[];
}

// ── cart snapshot ────────────────────────────────────────────────────────────

/** Mirrors `CartSnapshot` in supabase/functions/_shared/db/checkout-intents.ts. */
function buildSnapshot(picks: VariantRef[]) {
  const items = picks.map((v) => ({
    treatmentId: v.treatmentId,
    name: v.treatmentName,
    quantity: 1,
    variantId: v.variantId,
    variantLabel: v.variantLabel,
    guestCount: v.guestCount,
    price: v.price,
    isPriceOnRequest: false,
    isBundle: false,
  }));

  return {
    items,
    total: items.reduce((sum, i) => sum + i.price, 0),
    currency: "EUR",
    itemCount: items.length,
    scheduleMode: "sequential",
  };
}

// ── main ─────────────────────────────────────────────────────────────────────

if (CLIENTS.length !== TOTAL_CARTS || CART_PLANS.length !== TOTAL_CARTS) {
  throw new Error(`Expected ${TOTAL_CARTS} clients and cart plans`);
}
const plannedConversions = CART_PLANS.filter((p) => p.convertedAfterDays != null).length;
if (plannedConversions !== CONVERTED_CARTS) {
  throw new Error(`Expected ${CONVERTED_CARTS} conversions, found ${plannedConversions}`);
}

const organizationId = await psql(
  `select organization_id from hotels where id = ${sqlQuote(HANA)};`,
);
if (!organizationId) throw new Error(`Hotel ${HANA} has no organization_id`);

const variants = await loadVariants(HANA);
if (variants.length === 0) throw new Error(`No bookable treatment variant found for ${HANA}`);

const maxVariantIndex = Math.max(...CART_PLANS.flatMap((p) => p.variants));
if (maxVariantIndex >= variants.length) {
  throw new Error(`Cart plans reference variant #${maxVariantIndex}, only ${variants.length} loaded`);
}

const customerIds = CLIENTS.map((_, i) => sqlQuote(customerId(i)));
const intentIds = CLIENTS.map((_, i) => sqlQuote(intentId(i)));

// L'intent part en premier : il référence le client.
await psql(`delete from checkout_intents where id in (${intentIds.join(", ")});`);
await psql(`delete from customers where id in (${customerIds.join(", ")});`);

// Le cron relance une heure après l'abandon : ce sont donc les paniers les plus
// récents qui portent une relance. Les plus anciens datent d'avant l'activation
// de la fonctionnalité et restent à « Jamais ».
const abandonedIndexes = CART_PLANS.flatMap((p, i) => (p.convertedAfterDays == null ? [i] : []));
const remindedIndexes = new Set(abandonedIndexes.slice(-REMINDED_CARTS));

let converted = 0;
let reminded = 0;
let abandonedValue = 0;

for (const [i, client] of CLIENTS.entries()) {
  const plan = CART_PLANS[i];
  const snapshot = buildSnapshot(plan.variants.map((v) => variants[v]));
  const createdAt = `now() - interval '${client.daysAgo} days ${client.at.replace(":", " hours ")} minutes'`;

  await psql(`
    insert into customers (id, organization_id, email, first_name, last_name, language, created_at)
    values (${sqlQuote(customerId(i))}, ${sqlQuote(organizationId)}, ${sqlQuote(client.email)},
            ${sqlQuote(client.firstName)}, ${sqlQuote(client.lastName)}, 'fr', ${createdAt});
  `);

  const isConverted = plan.convertedAfterDays != null;
  const isReminded = remindedIndexes.has(i);

  // Le créneau souhaité : quelques jours après l'abandon, comme un vrai panier.
  const bookingDate = `(${createdAt})::date + interval '${4 + (i % 9)} days'`;
  const bookingTime = `'${pad(10 + (i % 8))}:${i % 2 === 0 ? "00" : "30"}'::time`;

  await psql(`
    insert into checkout_intents (id, customer_id, hotel_id, booking_date, booking_time,
                                  client_email, client_first_name, client_last_name, language,
                                  room_number, cart_snapshot, converted_at, reminder_count,
                                  reminder_sent_at, created_at, updated_at)
    values (${sqlQuote(intentId(i))}, ${sqlQuote(customerId(i))}, ${sqlQuote(HANA)},
            ${bookingDate}, ${bookingTime},
            ${sqlQuote(client.email)}, ${sqlQuote(client.firstName)}, ${sqlQuote(client.lastName)}, 'fr',
            ${client.roomNumber ? sqlQuote(client.roomNumber) : "NULL"},
            ${sqlQuote(JSON.stringify(snapshot))}::jsonb,
            ${isConverted ? `${createdAt} + interval '${plan.convertedAfterDays} days'` : "NULL"},
            ${isReminded ? (i % 5 === 0 ? 2 : 1) : 0},
            ${isReminded ? `${createdAt} + interval '1 hour'` : "NULL"},
            ${createdAt}, ${createdAt});
  `);

  if (isConverted) converted += 1;
  else {
    abandonedValue += snapshot.total;
    if (isReminded) reminded += 1;
  }

  const state = isConverted ? "convertie" : isReminded ? "relancé" : "abandonné";
  const cart = snapshot.items.map((it) => `${it.name} · ${it.variantLabel}`).join(" + ");
  console.log(`✓ ${client.firstName} ${client.lastName} — ${state} — ${snapshot.total} € — ${cart}`);
}

const rate = Math.round((converted / CLIENTS.length) * 100);
console.log(`\n${CLIENTS.length} paniers seedés : ${converted} converties, ${reminded} relancés.`);
console.log(`Taux de conversion attendu : ${rate} % · Valeur récupérable : ${Math.round(abandonedValue)} €`);
console.log("Ouvrir http://localhost:8080/admin/checkout-intents");
