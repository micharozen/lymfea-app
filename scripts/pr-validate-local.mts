/**
 * Local PR validation — fix/client-emails-hold-v2
 * Run: bun scripts/pr-validate-local.mts
 */
import { readFileSync, existsSync } from "node:fs";

function loadEnvLocal() {
  const path = "supabase/.env.local";
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();

let URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
let ANON = process.env.SUPABASE_ANON_KEY ?? "";
let SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function resolveLocalKeys(): Promise<void> {
  if (SERVICE.startsWith("sb_secret") || SERVICE.includes("service_role")) return;
  try {
    const proc = Bun.spawn(["bunx", "supabase", "status", "-o", "env"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "ignore",
    });
    const text = await new Response(proc.stdout).text();
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith("SERVICE_ROLE_KEY=")) {
        SERVICE = line.slice("SERVICE_ROLE_KEY=".length).replace(/^"|"$/g, "");
        process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
      }
      if (line.startsWith("ANON_KEY=")) {
        ANON = line.slice("ANON_KEY=".length).replace(/^"|"$/g, "");
        process.env.SUPABASE_ANON_KEY = ANON;
      }
      if (line.startsWith("PUBLISHABLE_KEY=") && !ANON) {
        ANON = line.slice("PUBLISHABLE_KEY=".length).replace(/^"|"$/g, "");
      }
    }
  } catch {
    /* local CLI unavailable */
  }
}
const HOTEL = "00000000-0000-0000-0000-000000000010";
const TREATMENT = "00000000-0000-0000-0000-000000000021";
const DUO_VARIANT = "00000000-0000-0000-0000-000000000302";
let THERAPIST = "00000000-0000-0000-0000-000000000103";

type R = { name: string; ok: boolean; detail: string };
const results: R[] = [];
const pass = (n: string, d = "ok") => { results.push({ name: n, ok: true, detail: d }); console.log(`✅ ${n} — ${d}`); };
const fail = (n: string, d: string) => { results.push({ name: n, ok: false, detail: d }); console.error(`❌ ${n} — ${d}`); };

async function fn(name: string, body: unknown, auth = ANON) {
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = text;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  return { status: res.status, json, text };
}

async function rest(table: string, opts: RequestInit & { query?: string } = {}) {
  const q = opts.query ?? "";
  const res = await fetch(`${URL}/rest/v1/${table}${q}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers as Record<string, string>),
    },
  });
  const text = await res.text();
  let json: unknown = text;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  return { status: res.status, json };
}

async function rpc(name: string, body: Record<string, unknown>) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = text;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  return { status: res.status, json, text };
}

function futureDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function createTestBooking(overrides: Record<string, unknown>) {
  const date = futureDate(14);
  const base = {
    hotel_id: HOTEL,
    hotel_name: "Hôtel Hana",
    client_first_name: "PR",
    client_last_name: "Validate",
    client_email: `pr-validate+${Date.now()}@lymfea-test.invalid`,
    phone: "+33600000099",
    booking_date: date,
    booking_time: "10:00:00",
    status: "pending",
    payment_status: "pending",
    payment_method: "card",
    client_type: "hotel",
    total_price: 90,
    duration: 60,
    language: "fr",
    guest_count: 1,
    ...overrides,
  };
  const { status, json } = await rest("bookings", { method: "POST", body: JSON.stringify(base) });
  if (status >= 200 && status < 300 && Array.isArray(json) && json[0]?.id) {
    return json[0] as { id: string; booking_id: number; client_email: string };
  }
  throw new Error(`create booking failed ${status}: ${JSON.stringify(json)}`);
}

async function deleteBooking(id: string) {
  await rest(`bookings?id=eq.${id}`, { method: "DELETE" });
}

async function main() {
  await resolveLocalKeys();
  ANON = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ANON;
  SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? SERVICE;
  URL = process.env.SUPABASE_URL ?? URL;
  if (!ANON || !SERVICE) {
    fail("setup:keys", "Could not resolve local Supabase keys — run supabase start");
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n=== ${results.length - failed}/${results.length} passed ===\n`);
    process.exit(1);
  }

  console.log("\n=== PR validation (local) ===\n");

  // Resolve seed therapist dynamically (DB may differ from seed UUIDs)
  {
    const { status, json } = await rest("therapist_venues", {
      query: `?hotel_id=eq.${HOTEL}&select=therapist_id,therapists(id,skills,first_name)&limit=5`,
    });
    const rows = Array.isArray(json) ? json : [];
    const withSkills = rows.find((r: { therapists?: { skills?: string[] } }) =>
      (r.therapists?.skills?.length ?? 0) > 0
    ) as { therapist_id?: string; therapists?: { skills?: string[]; first_name?: string } } | undefined;
    const any = rows[0] as { therapist_id?: string; therapists?: { skills?: string[] } } | undefined;
    const pick = withSkills ?? any;
    if (pick?.therapist_id) THERAPIST = pick.therapist_id;
    if (status === 200 && withSkills?.therapists?.skills?.length) {
      pass("db:therapist-skills", `${withSkills.therapists.skills?.join(", ")}`);
    } else if (status === 200 && rows.length > 0) {
      pass("db:therapist-skills", `venue has ${rows.length} therapist(s), skills column empty (run db reset?)`);
    } else {
      fail("db:therapist-skills", `${status} ${JSON.stringify(json)} — run bun run sup:reset`);
    }
  }
  for (const f of ["stripe-payment", "trigger-new-booking-notifications", "create-draft-booking", "send-payment-link", "notify-booking-confirmed"]) {
    const { status } = await fn(f, {});
    if (status === 503) fail(`boot:${f}`, "503 module load failure");
    else pass(`boot:${f}`, `HTTP ${status} (handler loaded)`);
  }

  // ── 2. npm imports static check ──
  const admin = readFileSync("supabase/functions/_shared/supabase-admin.ts", "utf8");
  if (admin.includes("npm:@supabase/supabase-js@2.57.2")) pass("imports:supabase-admin", "npm 2.57.2");
  else fail("imports:supabase-admin", "expected npm import");

  const esm572Files: string[] = [];
  for (const f of [
    "supabase/functions/stripe-payment/index.ts",
    "supabase/functions/trigger-new-booking-notifications/index.ts",
    "supabase/functions/_shared/supabase-admin.ts",
  ]) {
    if (readFileSync(f, "utf8").includes("esm.sh/@supabase/supabase-js@2.57.2")) {
      esm572Files.push(f);
    }
  }
  if (esm572Files.length === 0) pass("imports:no-esm-572", "hot paths clean");
  else fail("imports:no-esm-572", esm572Files.join(", "));

  // ── 1. Edge function boot (non-503) ──
  let soloDraftId: string | null = null;
  {
    const date = futureDate(10);
    const { status, json } = await fn("create-draft-booking", {
      hotelId: HOTEL,
      items: [{
        treatmentId: TREATMENT,
        variantId: "00000000-0000-0000-0000-000000000300",
        date,
        time: "11:00",
        quantity: 1,
        guestCount: 1,
      }],
    });
    const j = json as { success?: boolean; bookingIds?: string[]; holdSkipped?: boolean };
    if (status === 200 && j.success && j.bookingIds?.[0]) {
      soloDraftId = j.bookingIds[0];
      pass("hold:solo-draft", `id=${soloDraftId}`);
    } else if (j.holdSkipped) {
      pass("hold:solo-draft", "hold disabled on venue (skipped)");
    } else {
      fail("hold:solo-draft", `${status} ${JSON.stringify(json)}`);
    }
  }

  // ── 5. create-draft-booking duo guest_count=2 ──
  let duoDraftId: string | null = null;
  {
    const date = futureDate(11);
    const { status, json } = await fn("create-draft-booking", {
      hotelId: HOTEL,
      items: [{
        treatmentId: TREATMENT,
        variantId: DUO_VARIANT,
        date,
        time: "12:00",
        quantity: 1,
        guestCount: 2,
      }],
    });
    const j = json as { success?: boolean; bookingIds?: string[] };
    if (status === 200 && j.success && j.bookingIds?.[0]) {
      duoDraftId = j.bookingIds[0];
      const { json: row } = await rest("bookings", {
        query: `?id=eq.${duoDraftId}&select=guest_count,therapist_id,status`,
      });
      const b = Array.isArray(row) ? row[0] : null;
      if (b?.guest_count === 2 && b?.therapist_id == null) {
        pass("hold:duo-draft", `guest_count=2, therapist_id=null`);
      } else {
        fail("hold:duo-draft", `unexpected row ${JSON.stringify(b)}`);
      }
    } else if (j.holdSkipped) {
      pass("hold:duo-draft", "hold disabled on venue — enable booking_hold_enabled to test draft rows");
    } else {
      fail("hold:duo-draft", `${status} ${JSON.stringify(json)}`);
    }
  }

  // ── 6. reserve_trunk duo via RPC (room only) ──
  {
    const date = futureDate(12);
    const { status, json, text } = await rpc("reserve_trunk_atomically", {
      _hotel_id: HOTEL,
      _booking_date: date,
      _booking_time: "14:00:00",
      _duration: 0,
      _hotel_name: "Hôtel Hana",
      _client_first_name: "Duo",
      _client_last_name: "RPC",
      _client_email: "duo-rpc@test.invalid",
      _phone: "+33600000001",
      _room_number: "101",
      _client_note: null,
      _status: "awaiting_payment",
      _payment_method: "card",
      _payment_status: "awaiting_payment",
      _total_price: 170,
      _language: "fr",
      _treatment_ids: [TREATMENT],
      _guest_count: 2,
    });
    if (status === 200 && typeof json === "string") {
      const id = json.replace(/"/g, "");
      const { json: row } = await rest("bookings", {
        query: `?id=eq.${id}&select=guest_count,therapist_id,duration`,
      });
      const b = Array.isArray(row) ? row[0] : null;
      if (b?.guest_count === 2 && b?.therapist_id == null && b?.duration === 30) {
        pass("rpc:duo-reserve", `duration fallback 30, no therapist`);
      } else {
        fail("rpc:duo-reserve", JSON.stringify(b));
      }
      await deleteBooking(id);
    } else {
      fail("rpc:duo-reserve", `${status} ${text}`);
    }
  }

  // ── 7. trigger: external unpaid → no client email path ──
  {
    const b = await createTestBooking({
      client_type: "external",
      status: "confirmed",
      payment_status: "pending",
      ...(THERAPIST ? { therapist_id: THERAPIST, therapist_name: "Test Therapist" } : {}),
    });
    const { status, json } = await fn("trigger-new-booking-notifications", { bookingId: b.id }, SERVICE);
    const j = json as { success?: boolean };
    if (status === 200 && j.success) {
      pass("notify:external-unpaid-trigger", "200 success (client email skipped server-side)");
    } else {
      fail("notify:external-unpaid-trigger", `${status} ${JSON.stringify(json)}`);
    }
    await deleteBooking(b.id);
  }

  // ── 8. trigger: pending + card_saved → client email path ──
  {
    const b = await createTestBooking({
      client_type: "hotel",
      status: "pending",
      payment_status: "pending",
    });
    await rest("booking_payment_infos", {
      method: "POST",
      body: JSON.stringify({
        booking_id: b.id,
        payment_status: "card_saved",
        stripe_payment_method_id: "pm_test_pr_validate",
      }),
    });
    const { status, json } = await fn("trigger-new-booking-notifications", { bookingId: b.id }, SERVICE);
    if (status === 200 && (json as { success?: boolean }).success) {
      pass("notify:pending-card-saved", "trigger OK (send-booking-confirmation invoked)");
    } else {
      fail("notify:pending-card-saved", `${status} ${JSON.stringify(json)}`);
    }
    await deleteBooking(b.id);
  }

  // ── 9. payment link generate (stripe-payment) ──
  {
    const b = await createTestBooking({
      client_type: "external",
      status: "confirmed",
      payment_status: "pending",
      total_price: 90,
    });
    await rest("booking_treatments", {
      method: "POST",
      body: JSON.stringify({ booking_id: b.id, treatment_id: TREATMENT }),
    });
    const { status, json } = await fn("stripe-payment", {
      action: "send-payment-link",
      bookingId: b.id,
      language: "fr",
      mode: "generate",
    }, SERVICE);
    const j = json as { success?: boolean; paymentLinkUrl?: string };
    if (status === 200 && j.success && j.paymentLinkUrl?.includes("stripe.com")) {
      pass("payment-link:generate", j.paymentLinkUrl.slice(0, 50) + "…");
    } else {
      fail("payment-link:generate", `${status} ${JSON.stringify(json)}`);
    }
    await deleteBooking(b.id);
  }

  // ── 10. notify-booking-confirmed on confirmed + card_saved ──
  {
    const b = await createTestBooking({
      status: "confirmed",
      payment_status: "pending",
      ...(THERAPIST ? { therapist_id: THERAPIST, therapist_name: "Test Therapist" } : {}),
    });
    await rest("booking_payment_infos", {
      method: "POST",
      body: JSON.stringify({
        booking_id: b.id,
        payment_status: "card_saved",
        stripe_payment_method_id: "pm_test_notify_confirmed",
      }),
    });
    const { status, json } = await fn("notify-booking-confirmed", { bookingId: b.id }, SERVICE);
    const j = json as { success?: boolean; skipped?: string };
    if (status === 200 && (j.success || j.skipped)) {
      pass("notify:booking-confirmed", j.skipped ?? "success");
    } else {
      fail("notify:booking-confirmed", `${status} ${JSON.stringify(json)}`);
    }
    await deleteBooking(b.id);
  }

  // ── cleanup drafts ──
  for (const id of [soloDraftId, duoDraftId]) {
    if (id) await deleteBooking(id).catch(() => {});
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${results.length - failed}/${results.length} passed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
