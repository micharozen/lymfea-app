/**
 * Seeds the local Inbox with realistic inquiries to exercise the LLM agent.
 * Run: bun scripts/seed-inbox-local.mts
 *
 * Each row is inserted with its raw body only, then pushed through the real
 * `parse-email` action so `parsed_data` is genuine parser output rather than
 * hand-written JSON. Requires the edge function to be served locally:
 *
 *   supabase functions serve llm-agent --env-file supabase/functions/.env --no-verify-jwt
 *
 * Re-running the script replaces the seeded rows (fixed UUIDs), nothing else.
 */

const FUNCTIONS_URL = "http://127.0.0.1:54321/functions/v1/llm-agent";
const DB_CONTAINER = "supabase_db_xfkujlgettlxdgrnqluw";

// supabase/seed.sql
const HANA = "00000000-0000-0000-0000-000000000010";
const NARA = "00000000-0000-0000-0000-000000000011";

interface SeedInquiry {
  id: string;
  hotelId: string;
  /** What the case is meant to exercise, printed in the summary. */
  covers: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  /** Reply already sent by the venue — creates a thread on this inquiry. */
  reply?: { subject: string; body: string };
}

const DAYS = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const FR_DATE = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
};

const INQUIRIES: SeedInquiry[] = [
  {
    id: "e0000000-0000-0000-0000-000000000001",
    hotelId: HANA,
    covers: "Add-on trap — a generic \"massage\" must not resolve to the 15-min add-on",
    from: "claire.pommier@example.test",
    to: "hotel-hana@booking.eia.fr",
    subject: "Demande de massage",
    body: `Bonjour,

Je souhaiterais réserver un massage pour deux personnes le ${FR_DATE(5)} vers 15h.

Merci d'avance,
Claire`,
  },
  {
    id: "e0000000-0000-0000-0000-000000000002",
    hotelId: HANA,
    covers: "Forwarded by the front desk + explicit civility → \"Dear Mrs Warner\", reply goes to the client",
    from: "reception@hotel-hana.test",
    to: "hotel-hana@booking.eia.fr",
    subject: "Fwd: Booking for Warner",
    body: `Début du message réexpédié :

De: Reception - Hôtel Hana <reception@hotel-hana.test>
Objet: Booking for Warner
Date: ${DAYS(-1)}
À: "charlotte.warner@example.test" <charlotte.warner@example.test>

Dear Madame Warner,

Sunny greetings from Hôtel Hana!

Regarding the massage, we have duly added our wellness team in copy of this email. They will revert to you as soon as possible.

---

Hello,

We would like two reservations for massages on the afternoon of ${DAYS(4)}, around 3pm. Could you also recommend a restaurant nearby?

Thank you,
Charlotte Warner`,
  },
  {
    id: "e0000000-0000-0000-0000-000000000003",
    hotelId: HANA,
    covers: "First name only, no civility → must be named without guessing a gender",
    from: "joris.knoll@example.test",
    to: "hotel-hana@booking.eia.fr",
    subject: "Disponibilités week-end",
    body: `Bonjour,

C'est Joris. Auriez-vous de la place pour un soin du visage samedi prochain ?

Bien à vous`,
  },
  {
    id: "e0000000-0000-0000-0000-000000000004",
    hotelId: HANA,
    covers: "Out-of-catalogue package + unknown fact → knowledge base and anti-invention guard",
    from: "teresa.letteney@example.test",
    to: "hotel-hana@booking.eia.fr",
    subject: "Offre Beach & Self Care",
    body: `Bonjour,

Pourrions-nous réserver l'offre Beach & Self Care pour deux personnes ? Nous avons vu qu'elle était à 180 € par personne.

Par ailleurs, le spa est-il accessible aux personnes qui ne séjournent pas à l'hôtel ?

Cordialement,
Teresa Letteney`,
  },
  {
    id: "e0000000-0000-0000-0000-000000000005",
    hotelId: HANA,
    covers: "Pure question, low booking intent → answer it, do not push slots",
    from: "assistant@myersfamily.test",
    to: "hotel-hana@booking.eia.fr",
    subject: "Spa and Fitness Center Hours",
    body: `Good morning,

What are the opening hours of the spa and of the fitness centre?

Thank you`,
  },
  {
    id: "e0000000-0000-0000-0000-000000000006",
    hotelId: HANA,
    covers: "Known customer → civility and name come from the customers record, not the email",
    from: "m.durand@example.test",
    to: "hotel-hana@booking.eia.fr",
    subject: "Réservation",
    body: `Bonjour,

Je voudrais réserver un soin le ${FR_DATE(6)} en fin de matinée.

Merci`,
  },
  {
    id: "e0000000-0000-0000-0000-000000000007",
    hotelId: HANA,
    covers: "Thread follow-up → the draft must continue the conversation, not restart it",
    from: "nathalie.askayo@example.test",
    to: "hotel-hana@booking.eia.fr",
    subject: "Quel soin choisir ?",
    body: `Bonjour,

Je ne sais pas quoi choisir sur votre carte, je cherche un massage classique pour me détendre. Que me conseillez-vous ?

Nathalie Askayo`,
    reply: {
      subject: "Re: Quel soin choisir ?",
      body: `Chère Madame, Cher Monsieur,

Un massage relaxant de 60 minutes correspond parfaitement à votre demande. Vous pouvez y ajouter un masque hydratant pour une détente complète.

Pourriez-vous nous préciser le créneau souhaité ?

Chaleureusement,`,
    },
  },
  {
    id: "e0000000-0000-0000-0000-000000000008",
    hotelId: NARA,
    covers: "Second venue, no tone configured → built-in defaults must still apply",
    from: "kelsie.droppa@example.test",
    to: "spa-nara@booking.eia.fr",
    subject: "Massage booking for Ms. Maher",
    body: `Good afternoon,

I am a travel consultant looking to book my client and her guest for a 90 minute massage on ${DAYS(7)}.

Name: Ilona Maher + guest

Thank you,
Kelsie`,
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────

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

interface TreatmentRef {
  id: string;
  name: string | null;
  name_en: string | null;
  duration: number | null;
  category: string | null;
  is_addon: boolean;
  variants: unknown[];
}

async function loadTreatments(hotelId: string): Promise<TreatmentRef[]> {
  const rows = await psql(
    `select coalesce(json_agg(json_build_object(
       'id', id, 'name', name, 'name_en', name_en, 'duration', duration,
       'category', category, 'is_addon', is_addon, 'variants', coalesce(variants, '[]'::jsonb)
     )), '[]'::json) from get_public_treatments(${sqlQuote(hotelId)});`,
  );
  return JSON.parse(rows) as TreatmentRef[];
}

async function parseEmail(inquiry: SeedInquiry, treatments: TreatmentRef[], venueName: string) {
  const res = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer local" },
    body: JSON.stringify({
      action: "parse-email",
      subject: inquiry.subject,
      bodyText: inquiry.body,
      bodyHtml: null,
      fromAddress: inquiry.from,
      venueName,
      treatments,
    }),
  });
  if (!res.ok) throw new Error(`parse-email HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { parsed?: Record<string, unknown> | null; error?: string | null };
  if (json.error) throw new Error(json.error);
  return json.parsed ?? null;
}

// ── main ─────────────────────────────────────────────────────────────────────

const ids = INQUIRIES.map(i => sqlQuote(i.id)).join(", ");
await psql(`delete from email_inquiries where id in (${ids}) or parent_inquiry_id in (${ids});`);

// One inquiry is sent by a client we already know: the reply must use the
// civility stored on the customer record, not one guessed from the email.
// `customers.email` carries no unique constraint, hence the manual upsert.
await psql(`
  delete from customers where email = 'm.durand@example.test'
    and not exists (select 1 from bookings b where b.customer_id = customers.id);
  insert into customers (email, first_name, last_name, civility, language)
  select 'm.durand@example.test', 'Marie', 'Durand', 'madame', 'fr'
  where not exists (select 1 from customers where email = 'm.durand@example.test');
`);

const venueNames = new Map<string, string>(
  (await psql(`select id || '|' || name from hotels where id in (${sqlQuote(HANA)}, ${sqlQuote(NARA)});`))
    .split("\n")
    .map(line => line.split("|") as [string, string]),
);

const treatmentsByHotel = new Map<string, TreatmentRef[]>();
for (const hotelId of [HANA, NARA]) {
  treatmentsByHotel.set(hotelId, await loadTreatments(hotelId));
}

let parsedCount = 0;
for (const inquiry of INQUIRIES) {
  const venueName = venueNames.get(inquiry.hotelId) ?? "";
  let parsed: Record<string, unknown> | null = null;
  let status = "received";
  try {
    parsed = await parseEmail(inquiry, treatmentsByHotel.get(inquiry.hotelId) ?? [], venueName);
    if (parsed) {
      status = "parsed";
      parsedCount += 1;
    }
  } catch (err) {
    console.warn(`  ⚠ ${inquiry.subject}: parsing skipped (${(err as Error).message})`);
  }

  const confidence = typeof parsed?.intent_confidence === "number" ? String(parsed.intent_confidence) : "NULL";
  await psql(`
    insert into email_inquiries (id, hotel_id, from_address, to_address, subject, raw_body_text,
                                 status, direction, confidence_score, parsed_data, message_id)
    values (${sqlQuote(inquiry.id)}, ${sqlQuote(inquiry.hotelId)}, ${sqlQuote(inquiry.from)},
            ${sqlQuote(inquiry.to)}, ${sqlQuote(inquiry.subject)}, ${sqlQuote(inquiry.body)},
            ${sqlQuote(status)}, 'inbound', ${confidence},
            ${parsed ? `${sqlQuote(JSON.stringify(parsed))}::jsonb` : "NULL"},
            ${sqlQuote(`<seed-${inquiry.id}@local>`)});
  `);

  if (inquiry.reply) {
    await psql(`
      insert into email_inquiries (hotel_id, parent_inquiry_id, direction, from_address, to_address,
                                   subject, raw_body_text, status, created_at)
      values (${sqlQuote(inquiry.hotelId)}, ${sqlQuote(inquiry.id)}, 'outbound', ${sqlQuote(inquiry.to)},
              ${sqlQuote(inquiry.from)}, ${sqlQuote(inquiry.reply.subject)}, ${sqlQuote(inquiry.reply.body)},
              'sent', now() - interval '1 hour');
      update email_inquiries set status = 'replied', last_reply_at = now() - interval '1 hour'
        where id = ${sqlQuote(inquiry.id)};
    `);
  }

  console.log(`✓ ${inquiry.subject}\n    ${inquiry.covers}`);
}

console.log(`\n${INQUIRIES.length} inquiries seeded (${parsedCount} parsed by the LLM).`);
console.log("Open http://localhost:8080/admin/inbox and hit \"Brouillon IA\" on any of them.");
