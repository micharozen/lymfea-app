/**
 * Local test battery for admin combo duo + infra health.
 * Run: bun scripts/test-admin-combo-duo-local.mts
 */
import {
  ADMIN_COMBO_DUO_ENABLED,
  buildComboDuoBookingParams,
  computeStaffingCount,
  expandCartToSessions,
  getSessionCount,
  isComboDuoEligible,
} from "../src/features/admin-combo-duo/index.ts";

// Seed IDs (supabase/seed.sql)
const HOTEL_ID = "00000000-0000-0000-0000-000000000010";
const MASSAGE_ID = "00000000-0000-0000-0000-000000000021";
const DEEP_TISSUE_ID = "00000000-0000-0000-0000-000000000024";
const FACIAL_ID = "00000000-0000-0000-0000-000000000025";
const VARIANT_SOLO_60 = "00000000-0000-0000-0000-000000000300";
const VARIANT_DUO_60 = "00000000-0000-0000-0000-000000000302";
const VARIANT_DEEP = "00000000-0000-0000-0000-000000000310";
const VARIANT_FACIAL = "00000000-0000-0000-0000-000000000320";
const THERAPIST_F = "00000000-0000-0000-0000-000000000102";
const THERAPIST_M = "00000000-0000-0000-0000-000000000104";
const ADMIN_USER = "00000000-0000-0000-0000-000000000001";

type Result = { name: string; ok: boolean; detail?: string };

const results: Result[] = [];
const createdBookingIds: string[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, ok: false, detail });
  console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

function treatment(id: string, name: string, duration: number, price: number, variants?: Array<{ id: string; guest_count?: number; duration?: number; price?: number; label?: string }>) {
  return { id, name, duration, price, treatment_variants: variants };
}

// ─── 1. Module unit tests (no DB) ───────────────────────────────────────────

function runModuleTests() {
  console.log("\n📦 Module admin-combo-duo");

  assert("ADMIN_COMBO_DUO_ENABLED", ADMIN_COMBO_DUO_ENABLED === true);

  const massage = treatment(MASSAGE_ID, "Massage relaxant", 60, 90, [
    { id: VARIANT_SOLO_60, guest_count: 1, duration: 60, price: 90, label: "60 min" },
    { id: VARIANT_DUO_60, guest_count: 2, duration: 60, price: 170, label: "duo" },
  ]);
  const deep = treatment(DEEP_TISSUE_ID, "Deep tissue", 75, 120, [
    { id: VARIANT_DEEP, guest_count: 1, duration: 75, price: 120 },
  ]);
  const facial = treatment(FACIAL_ID, "Soin éclat", 45, 75, [
    { id: VARIANT_FACIAL, guest_count: 1, duration: 45, price: 75 },
  ]);

  const cart2solo = [
    { treatmentId: MASSAGE_ID, variantId: VARIANT_SOLO_60, quantity: 2, treatment: massage },
  ];
  const sessions2 = expandCartToSessions(cart2solo);
  assert("expandCartToSessions qty=2 → 2 sessions", sessions2.length === 2);
  assert("getSessionCount", getSessionCount(cart2solo) === 2);
  assert("isComboDuoEligible (2 solo)", isComboDuoEligible(sessions2) === true);

  const cartMixed = [
    { treatmentId: MASSAGE_ID, variantId: VARIANT_SOLO_60, quantity: 1, treatment: massage },
    { treatmentId: DEEP_TISSUE_ID, variantId: VARIANT_DEEP, quantity: 1, treatment: deep },
  ];
  const sessionsMixed = expandCartToSessions(cartMixed);
  const comboParams = buildComboDuoBookingParams(sessionsMixed);
  assert("combo payload guestCount=2", comboParams.guestCount === 2);
  assert("combo payload duration=max(60,75)=75", comboParams.duration === 75);
  assert("combo payload 2 treatment lines", comboParams.treatments.length === 2);

  const cartDuoVariant = [
    { treatmentId: MASSAGE_ID, variantId: VARIANT_DUO_60, quantity: 1, treatment: massage },
  ];
  const sessionsDuoVar = expandCartToSessions(cartDuoVariant);
  assert("variant duo NOT combo-eligible", isComboDuoEligible(sessionsDuoVar) === false);

  const cartSoloPlusDuo = [
    { treatmentId: MASSAGE_ID, variantId: VARIANT_SOLO_60, quantity: 1, treatment: massage },
    { treatmentId: MASSAGE_ID, variantId: VARIANT_DUO_60, quantity: 1, treatment: massage },
  ];
  assert(
    "explicit solo + duo variants NOT combo-eligible",
    isComboDuoEligible(expandCartToSessions(cartSoloPlusDuo)) === false,
  );

  const cart3 = [
    { treatmentId: MASSAGE_ID, variantId: VARIANT_SOLO_60, quantity: 1, treatment: massage },
    { treatmentId: DEEP_TISSUE_ID, variantId: VARIANT_DEEP, quantity: 1, treatment: deep },
    { treatmentId: FACIAL_ID, variantId: VARIANT_FACIAL, quantity: 1, treatment: facial },
  ];
  const sessions3 = expandCartToSessions(cart3);
  assert("3 solo combo eligible", isComboDuoEligible(sessions3) === true);
  assert("staffingCount combo 3", computeStaffingCount(true, 3, 1) === 3);
  assert("staffingCount variant duo", computeStaffingCount(false, 1, 2) === 2);
  assert("buildComboDuo 3 sessions guestCount=3", buildComboDuoBookingParams(sessions3).guestCount === 3);
  assert("buildComboDuo 3 sessions duration=max(60,75,45)=75", buildComboDuoBookingParams(sessions3).duration === 75);
}

// ─── 2. Infra + DB integration via docker psql ──────────────────────────────

async function dockerPsql(sql: string): Promise<string> {
  const proc = Bun.spawn(
    ["docker", "exec", "supabase_db_xfkujlgettlxdgrnqluw", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", sql],
    { stdout: "pipe", stderr: "pipe" },
  );
  const code = await proc.exited;
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  if (code !== 0) throw new Error(err || out || `psql exit ${code}`);
  return out.trim();
}

async function runInfraTests() {
  console.log("\n🔌 Infra Supabase locale");

  try {
    const tables = await dockerPsql(
      `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('user_roles','bookings','booking_treatments','booking_therapists','treatment_variants')`,
    );
    assert("Tables critiques présentes", tables === "5");

    const roles = await dockerPsql(
      `SELECT string_agg(role::text, ',') FROM public.user_roles WHERE user_id='${ADMIN_USER}'`,
    );
    assert("Seed admin role", roles === "admin");

    const variantDuo = await dockerPsql(
      `SELECT guest_count::text FROM public.treatment_variants WHERE id='${VARIANT_DUO_60}'`,
    );
    assert("Seed variante duo guest_count=2", variantDuo === "2");
  } catch (e) {
    fail("Infra docker/psql", e instanceof Error ? e.message : String(e));
    return false;
  }
  return true;
}

async function createBooking(opts: {
  label: string;
  guestCount: number;
  duration: number;
  totalPrice: number;
  treatments: Array<{ treatmentId: string; variantId: string }>;
  therapistIds?: string[];
  status?: string;
}): Promise<string | null> {
  const bookingId = crypto.randomUUID();
  const status = opts.status ?? (opts.therapistIds?.length ? "confirmed" : "pending");
  const primaryTherapist = opts.therapistIds?.[0] ?? null;

  const esc = (s: string) => s.replace(/'/g, "''");
  const therapistName = primaryTherapist
    ? await dockerPsql(`SELECT first_name || ' ' || last_name FROM public.therapists WHERE id='${primaryTherapist}'`)
    : null;

  await dockerPsql(`
    INSERT INTO public.bookings (
      id, hotel_id, hotel_name, client_first_name, client_last_name, phone,
      booking_date, booking_time, therapist_id, therapist_name, status,
      total_price, duration, guest_count, source, language, client_type, payment_status
    ) VALUES (
      '${bookingId}', '${HOTEL_ID}', 'Hôtel Hana', 'Test', 'ComboDuo', '+33600000099',
      '2026-07-01', '10:00', ${primaryTherapist ? `'${primaryTherapist}'` : "NULL"},
      ${therapistName ? `'${esc(therapistName)}'` : "NULL"}, '${status}',
      ${opts.totalPrice}, ${opts.duration}, ${opts.guestCount}, 'admin', 'fr', 'external', 'pending'
    )
  `);

  for (const t of opts.treatments) {
    await dockerPsql(`
      INSERT INTO public.booking_treatments (id, booking_id, treatment_id, variant_id)
      VALUES ('${crypto.randomUUID()}', '${bookingId}', '${t.treatmentId}', '${t.variantId}')
    `);
  }

  if (opts.therapistIds?.length) {
    for (const tid of opts.therapistIds) {
      await dockerPsql(`
        INSERT INTO public.booking_therapists (id, booking_id, therapist_id, status, assigned_at)
        VALUES ('${crypto.randomUUID()}', '${bookingId}', '${tid}', 'accepted', NOW())
      `);
    }
  }

  createdBookingIds.push(bookingId);
  return bookingId;
}

async function verifyBooking(bookingId: string, expected: {
  guestCount: number;
  duration: number;
  treatmentCount: number;
  therapistCount: number;
  noGroup: boolean;
  status?: string;
}) {
  const row = await dockerPsql(`
    SELECT guest_count || '|' || duration || '|' || COALESCE(booking_group_id::text,'NULL') || '|' || status
    FROM public.bookings WHERE id='${bookingId}'
  `);
  const [gc, dur, group, status] = row.split("|");
  const btCount = await dockerPsql(`SELECT count(*)::text FROM public.booking_treatments WHERE booking_id='${bookingId}'`);
  const thCount = await dockerPsql(`SELECT count(*)::text FROM public.booking_therapists WHERE booking_id='${bookingId}'`);

  const ok =
    gc === String(expected.guestCount) &&
    dur === String(expected.duration) &&
    btCount === String(expected.treatmentCount) &&
    thCount === String(expected.therapistCount) &&
    (expected.noGroup ? group === "NULL" : true) &&
    (expected.status ? status === expected.status : true);

  return { ok, detail: `guest_count=${gc} duration=${dur} treatments=${btCount} therapists=${thCount} group=${group} status=${status}` };
}

async function runDbScenarioTests() {
  console.log("\n🗄️  Scénarios DB (combo duo)");

  try {
    // Scenario 1: 2 solo + combo duo
    const id1 = await createBooking({
      label: "2 solo combo",
      guestCount: 2,
      duration: 75,
      totalPrice: 210,
      treatments: [
        { treatmentId: MASSAGE_ID, variantId: VARIANT_SOLO_60 },
        { treatmentId: DEEP_TISSUE_ID, variantId: VARIANT_DEEP },
      ],
      therapistIds: [THERAPIST_F, THERAPIST_M],
    });
    const v1 = await verifyBooking(id1!, { guestCount: 2, duration: 75, treatmentCount: 2, therapistCount: 2, noGroup: true });
    assert("S1: 2 solo combo → guest_count=2, max duration, 2 therapists, no group", v1.ok, v1.detail);

    // Scenario 2: variant duo catalogue (no combo toggle path)
    const id2 = await createBooking({
      label: "variant duo",
      guestCount: 2,
      duration: 60,
      totalPrice: 170,
      treatments: [{ treatmentId: MASSAGE_ID, variantId: VARIANT_DUO_60 }],
      therapistIds: [THERAPIST_F, THERAPIST_M],
    });
    const v2 = await verifyBooking(id2!, { guestCount: 2, duration: 60, treatmentCount: 1, therapistCount: 2, noGroup: true });
    assert("S2: variante duo → guest_count=2, 1 treatment line", v2.ok, v2.detail);

    // Scenario 3: 2 solo sequential (historical, no combo)
    const id3 = await createBooking({
      label: "2 solo sequential",
      guestCount: 1,
      duration: 135,
      totalPrice: 210,
      treatments: [
        { treatmentId: MASSAGE_ID, variantId: VARIANT_SOLO_60 },
        { treatmentId: DEEP_TISSUE_ID, variantId: VARIANT_DEEP },
      ],
      therapistIds: [THERAPIST_F],
    });
    const v3 = await verifyBooking(id3!, { guestCount: 1, duration: 135, treatmentCount: 2, therapistCount: 1, noGroup: true });
    assert("S3: 2 solo sans combo → guest_count=1, duration=somme(135)", v3.ok, v3.detail);

    // Scenario 4: 3 solo combo
    const id4 = await createBooking({
      label: "3 solo combo",
      guestCount: 3,
      duration: 75,
      totalPrice: 285,
      treatments: [
        { treatmentId: MASSAGE_ID, variantId: VARIANT_SOLO_60 },
        { treatmentId: DEEP_TISSUE_ID, variantId: VARIANT_DEEP },
        { treatmentId: FACIAL_ID, variantId: VARIANT_FACIAL },
      ],
      therapistIds: [THERAPIST_F, THERAPIST_M],
    });
    const v4 = await verifyBooking(id4!, { guestCount: 3, duration: 75, treatmentCount: 3, therapistCount: 2, noGroup: true });
    assert("S4: 3 solo combo → guest_count=3, 3 treatments, 2 therapists (seed)", v4.ok, v4.detail);

    // Scenario 5: broadcast (pending, no therapists)
    const id5 = await createBooking({
      label: "combo broadcast",
      guestCount: 2,
      duration: 60,
      totalPrice: 180,
      treatments: [
        { treatmentId: MASSAGE_ID, variantId: VARIANT_SOLO_60 },
        { treatmentId: MASSAGE_ID, variantId: VARIANT_SOLO_60 },
      ],
      status: "pending",
    });
    const v5 = await verifyBooking(id5!, { guestCount: 2, duration: 60, treatmentCount: 2, therapistCount: 0, noGroup: true, status: "pending" });
    assert("S5: combo broadcast → pending, 0 therapists", v5.ok, v5.detail);

    // Scenario 6: no booking_group_id on any test booking
    const groupCount = await dockerPsql(`
      SELECT count(*)::text FROM public.bookings
      WHERE id IN (${createdBookingIds.map((id) => `'${id}'`).join(",")})
      AND booking_group_id IS NOT NULL
    `);
    assert("S6: aucun booking_group_id sur les résas combo test", groupCount === "0");
  } catch (e) {
    fail("Scénarios DB", e instanceof Error ? e.message : String(e));
  }
}

async function runAuthTests() {
  console.log("\n🔐 Auth REST locale");

  const statusProc = Bun.spawn(["bunx", "supabase", "status", "-o", "env"], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: import.meta.dir + "/..",
  });
  await statusProc.exited;
  const envOut = await new Response(statusProc.stdout).text();
  const publishable = envOut.match(/SUPABASE_ANON_KEY="([^"]+)"/)?.[1]
    ?? envOut.match(/PUBLISHABLE_KEY="([^"]+)"/)?.[1];

  if (!publishable) {
    fail("Récupération clé publishable via supabase status");
    return;
  }

  const base = "http://127.0.0.1:54321";
  const headers = { apikey: publishable, "Content-Type": "application/json" };

  for (const [label, email] of [["admin", "admin@oom.dev"], ["concierge", "concierge@oom.dev"], ["therapist", "therapist@lymfea.dev"]] as const) {
    const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: "password" }),
    });
    if (!res.ok) {
      fail(`Login ${label}`, `${res.status} ${await res.text()}`);
      continue;
    }
    const data = await res.json() as { access_token: string; user: { id: string } };
    const roleRes = await fetch(
      `${base}/rest/v1/user_roles?select=role&user_id=eq.${data.user.id}`,
      { headers: { ...headers, Authorization: `Bearer ${data.access_token}` } },
    );
    const roles = await roleRes.json() as Array<{ role: string }>;
    assert(`Login ${label} + role`, roleRes.ok && roles.length > 0, roles.map((r) => r.role).join(","));
  }
}

async function runTypecheck() {
  console.log("\n📝 TypeScript");
  const proc = Bun.spawn(["bunx", "tsc", "--noEmit"], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: import.meta.dir + "/..",
  });
  const code = await proc.exited;
  if (code === 0) pass("bunx tsc --noEmit");
  else {
    const err = await new Response(proc.stderr).text();
    fail("bunx tsc --noEmit", err.slice(0, 300));
  }
}

async function cleanup() {
  if (!createdBookingIds.length) return;
  console.log("\n🧹 Nettoyage réservations de test");
  try {
    const ids = createdBookingIds.map((id) => `'${id}'`).join(",");
    await dockerPsql(`DELETE FROM public.booking_therapists WHERE booking_id IN (${ids})`);
    await dockerPsql(`DELETE FROM public.booking_treatments WHERE booking_id IN (${ids})`);
    await dockerPsql(`DELETE FROM public.bookings WHERE id IN (${ids})`);
    pass(`Supprimé ${createdBookingIds.length} bookings de test`);
  } catch (e) {
    fail("Cleanup", e instanceof Error ? e.message : String(e));
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════");
console.log("  Batterie de tests — admin combo duo (local)");
console.log("═══════════════════════════════════════════════════");

runModuleTests();
await runTypecheck();
const infraOk = await runInfraTests();
if (infraOk) {
  await runAuthTests();
  await runDbScenarioTests();
}
await cleanup();

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log("\n═══════════════════════════════════════════════════");
console.log(`  Résultat: ${passed}/${results.length} OK`);
if (failed.length) {
  console.log("  Échecs:");
  for (const f of failed) console.log(`    - ${f.name}: ${f.detail ?? ""}`);
  process.exit(1);
}
console.log("  Tous les tests sont passés ✨");
console.log("═══════════════════════════════════════════════════");
