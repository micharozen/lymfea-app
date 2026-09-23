/**
 * Synthèse J-1 : un push par thérapeute, le soir, listant ses rendez-vous du
 * lendemain.
 *
 * Remplace le récapitulatif WhatsApp que la coordinatrice recopiait chaque soir
 * depuis le planning de chacun.
 *
 * Déclenchée toutes les heures (pg_cron tourne en UTC) : la fonction ne retient
 * que les fuseaux où il est `SEND_LOCAL_HOUR` en heure locale, ce qui donne un
 * envoi à 19 h chez chaque lieu quelle que soit la saison.
 *
 * La synthèse est une `notifications` de type 'daily_digest' : elle apparaît
 * donc aussi dans la liste de la PWA et dans le badge non-lu. L'index unique
 * partiel `uniq_notifications_daily_digest` sert de verrou de déduplication.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { myLegDuration } from "../_shared/therapistLegDuration.ts";
import { userIdFromAuthHeader, VenueAuthzError } from "../_shared/venue-authz.ts";
import { venueLocalToUtc } from "../_shared/venue-time.ts";

const SEND_LOCAL_HOUR = 19;
const DIGEST_TYPE = "daily_digest";
const PUSH_TYPE = "digest_d1";
const PAGE_SIZE = 1000;

// La relance ciblée part du navigateur (onglet « Récap J-1 » de l'admin).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXCLUDED_STATUSES = [
  "cancelled",
  "canceled",
  "Annulé",
  "declined",
  "expired",
  "no_show",
  "noshow",
];

interface HotelRow {
  id: string;
  name: string | null;
  timezone: string | null;
}

interface TreatmentRow {
  therapist_id: string | null;
  duration: number | null;
  is_addon: boolean | null;
  treatment_menus: { name: string | null; duration: number | null } | null;
}

interface BookingRow {
  id: string;
  booking_date: string;
  booking_time: string | null;
  duration: number | null;
  guest_count: number | null;
  hotel_id: string | null;
  therapist_id: string | null;
  hotels: HotelRow | null;
  booking_therapists: { therapist_id: string | null; status: string | null; assigned_at: string | null }[] | null;
  booking_treatments: TreatmentRow[] | null;
}

const BOOKING_SELECT = `
  id, booking_date, booking_time, duration, guest_count, hotel_id, therapist_id,
  hotels!inner ( id, name, timezone ),
  booking_therapists ( therapist_id, status, assigned_at ),
  booking_treatments ( therapist_id, is_addon, treatment_menus ( name, duration ) )
`;

/** Heure et date locales d'un instant dans un fuseau donné. */
function localParts(at: Date, timezone: string): { hour: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  // `hour12: false` rend minuit "24" sur certaines plateformes.
  return { hour: Number(parts.hour) % 24, date: `${parts.year}-${parts.month}-${parts.day}` };
}

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Durée d'une prestation : la ligne prime, sinon le menu. */
function treatmentDuration(t: TreatmentRow): number | null {
  return t.treatment_menus?.duration ?? null;
}

/** Praticiens ayant accepté, dans l'ordre stable attendu par myLegDuration. */
function orderedTherapistIds(b: BookingRow): string[] {
  return (b.booking_therapists ?? [])
    .filter((bt) => bt.status === "accepted" && bt.therapist_id)
    .sort((a, z) => (a.assigned_at ?? "").localeCompare(z.assigned_at ?? ""))
    .map((bt) => bt.therapist_id as string);
}

/**
 * Un rendez-vous « appartient » à un praticien par trois chemins : l'affectation
 * principale, la prestation qu'il porte (duo), ou son acceptation de la diffusion.
 */
function therapistsOf(b: BookingRow): Set<string> {
  const ids = new Set<string>();
  if (b.therapist_id) ids.add(b.therapist_id);
  for (const bt of b.booking_treatments ?? []) {
    if (bt.therapist_id) ids.add(bt.therapist_id);
  }
  for (const bt of b.booking_therapists ?? []) {
    if (bt.status === "accepted" && bt.therapist_id) ids.add(bt.therapist_id);
  }
  return ids;
}

/** Minutes réellement dues à ce praticien sur cette réservation. */
function legMinutes(b: BookingRow, therapistId: string): number {
  const lines = (b.booking_treatments ?? []).map((t) => ({
    therapist_id: t.therapist_id,
    duration: treatmentDuration(t),
    is_addon: t.is_addon,
  }));
  if (lines.length === 0) return b.duration ?? 0;
  const ordered = orderedTherapistIds(b);
  const minutes = myLegDuration(
    therapistId,
    lines,
    ordered.length > 0 ? ordered : [therapistId],
    b.guest_count ?? 1,
  );
  return minutes > 0 ? minutes : (b.duration ?? 0);
}

/** Instant absolu du début, pour trier une journée à cheval sur deux fuseaux. */
function startInstant(b: BookingRow): number {
  const tz = b.hotels?.timezone ?? "Europe/Paris";
  const at = venueLocalToUtc(b.booking_date, b.booking_time ?? "00:00", tz);
  return at ? at.getTime() : Number.MAX_SAFE_INTEGER;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const isLocal = Deno.env.get("IS_LOCAL") === "true";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const body = await req.json().catch(() => ({}));
    const forcedTherapistIds: string[] = Array.isArray(body?.therapistIds) ? body.therapistIds : [];
    const force = body?.force === true;
    // Simulation réservée au développement : elle changerait sinon la fenêtre
    // d'envoi en production.
    const dryRun = isLocal && body?.dryRun === true;
    const now = isLocal && typeof body?.now === "string" ? new Date(body.now) : new Date();

    // Une relance ciblée peut venir d'un admin ; une tournée complète, non.
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
    if (!isServiceRole) {
      const userId = userIdFromAuthHeader(authHeader);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      if (forcedTherapistIds.length === 0) {
        return json({ error: "therapistIds required" }, 400);
      }
    }

    const { data: hotels, error: hotelsError } = await supabase
      .from("hotels")
      .select("id, name, timezone");
    if (hotelsError) throw hotelsError;

    const hotelsById = new Map<string, HotelRow>((hotels ?? []).map((h: HotelRow) => [h.id, h]));

    // Une relance explicite part tout de suite : elle n'attend pas 19 h.
    const manualTargetDate: string | null =
      forcedTherapistIds.length > 0 && typeof body?.targetDate === "string" ? body.targetDate : null;

    // Sinon : quels fuseaux sont à l'heure d'envoi ? On raisonne par fuseau
    // distinct, il y en a une poignée pour des dizaines de lieux.
    const dueTimezones = new Map<string, string>();
    if (!manualTargetDate) {
      const zones = new Set<string>(
        (hotels ?? []).map((h: HotelRow) => h.timezone || "Europe/Paris"),
      );
      for (const tz of zones) {
        const { hour, date } = localParts(now, tz);
        if (hour === SEND_LOCAL_HOUR) dueTimezones.set(tz, nextDay(date));
      }
      if (dueTimezones.size === 0) {
        return json({ due: 0, sent: 0, skipped: {}, targetDates: [] });
      }
    }

    const targetDates = manualTargetDate
      ? [manualTargetDate]
      : [...new Set(dueTimezones.values())];

    // Toutes les réservations des journées concernées, paginées : PostgREST
    // tronque à 1000 lignes en silence, et un récap tronqué perdrait des
    // thérapeutes sans lever d'erreur.
    const bookings: BookingRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .in("booking_date", targetDates)
        .not("status", "in", `(${EXCLUDED_STATUSES.map((s) => `"${s}"`).join(",")})`)
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as unknown as BookingRow[];
      bookings.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    // Regroupement par praticien, chaque journée triée chronologiquement.
    const byTherapist = new Map<string, BookingRow[]>();
    for (const b of bookings) {
      for (const id of therapistsOf(b)) {
        if (forcedTherapistIds.length > 0 && !forcedTherapistIds.includes(id)) continue;
        const list = byTherapist.get(id);
        if (list) list.push(b);
        else byTherapist.set(id, [b]);
      }
    }
    for (const list of byTherapist.values()) {
      list.sort((a, z) => startInstant(a) - startInstant(z));
    }

    if (byTherapist.size === 0) {
      return json({ due: dueTimezones.size, candidates: 0, sent: 0, skipped: {}, targetDates });
    }

    const { data: therapists, error: therapistsError } = await supabase
      .from("therapists")
      .select("id, user_id, first_name")
      .in("id", [...byTherapist.keys()])
      .not("user_id", "is", null);
    if (therapistsError) throw therapistsError;

    const skipPush = isLocal || !Deno.env.get("ONESIGNAL_APP_ID");
    const skipped = { already: 0, noUser: 0, notPivot: 0 };
    const plan: unknown[] = [];
    let sent = 0;
    let failed = 0;

    for (const therapist of therapists ?? []) {
      try {
        const rows = byTherapist.get(therapist.id) ?? [];
        if (rows.length === 0 || !therapist.user_id) {
          skipped.noUser++;
          continue;
        }

        // Le lieu du premier rendez-vous décide du fuseau : un praticien qui
        // enchaîne deux pays ne reçoit qu'un seul push, à l'heure de son premier
        // lieu, mais la synthèse liste bien toute sa journée.
        const first = rows[0];
        const pivotTz = first.hotels?.timezone ?? "Europe/Paris";
        const targetDate = manualTargetDate ?? dueTimezones.get(pivotTz);
        if (!targetDate || first.booking_date !== targetDate) {
          skipped.notPivot++;
          continue;
        }

        const dayRows = rows.filter((b) => b.booking_date === targetDate);
        if (dayRows.length === 0) {
          skipped.notPivot++;
          continue;
        }

        const totalMinutes = dayRows.reduce((sum, b) => sum + legMinutes(b, therapist.id), 0);
        const venues = [
          ...new Set(dayRows.map((b) => b.hotels?.name).filter(Boolean) as string[]),
        ];
        const firstTime = (dayRows[0].booking_time ?? "").slice(0, 5);
        const copy = buildCopy(dayRows.length, firstTime, venues, totalMinutes);

        if (dryRun) {
          plan.push({
            therapistId: therapist.id,
            firstName: therapist.first_name,
            targetDate,
            bookingCount: dayRows.length,
            totalMinutes,
            venues,
            ...copy,
          });
          continue;
        }

        // Le verrou de dédup : l'index unique partiel refuse la deuxième ligne.
        // Un INSERT sec plutôt qu'un upsert — `ON CONFLICT` ne sait pas viser un
        // index partiel, et le code 23505 renvoyé est tout aussi atomique.
        const { error: claimError } = await supabase.from("notifications").insert({
          user_id: therapist.user_id,
          type: DIGEST_TYPE,
          target_date: targetDate,
          message: copy.bodyFr,
          read: false,
        });

        const alreadySent = claimError?.code === "23505";
        if (claimError && !alreadySent) throw claimError;
        if (alreadySent && !force) {
          skipped.already++;
          continue;
        }

        if (skipPush) {
          sent++;
          console.log(`[LOCAL] Digest J-1 (push sauté) pour ${therapist.first_name ?? therapist.id}`);
          continue;
        }

        const { data: pushResult, error: pushError } = await supabase.functions.invoke(
          "send-push-notification",
          {
            body: {
              userId: therapist.user_id,
              title: copy.titleEn,
              titleFr: copy.titleFr,
              body: copy.bodyEn,
              bodyFr: copy.bodyFr,
              data: { url: `/pwa/tomorrow?src=digest-d1&d=${targetDate}`, type: PUSH_TYPE },
            },
            headers: { Authorization: `Bearer ${serviceRoleKey}` },
          },
        );

        // `functions.invoke` ne lève pas sur un `success:false` renvoyé en 200 :
        // sans cette lecture, un push jamais parti passerait pour envoyé.
        const delivered = !pushError && pushResult?.delivered === true;
        if (delivered) {
          sent++;
        } else {
          failed++;
          console.error(
            `Digest J-1 non délivré pour ${therapist.id}:`,
            pushError?.message ?? JSON.stringify(pushResult),
          );
        }
      } catch (err) {
        // Un profil cassé ne doit pas avaler le reste de la tournée.
        failed++;
        console.error(`Digest J-1 en échec pour ${therapist.id}:`, err);
      }
    }

    return json({
      due: dueTimezones.size,
      candidates: byTherapist.size,
      targetDates,
      sent,
      failed,
      skipped,
      ...(dryRun ? { dryRun: true, plan } : {}),
    });
  } catch (error) {
    if (error instanceof VenueAuthzError) {
      return json({ error: error.message }, error.status);
    }
    console.error("[CRON] send-tomorrow-digest error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

function buildCopy(count: number, firstTime: string, venues: string[], minutes: number) {
  const venueLabel = venues[0] ?? "";
  const extra = venues.length - 1;
  const venueFr = extra > 0 ? `${venueLabel} +${extra} autre lieu${extra > 1 ? "x" : ""}` : venueLabel;
  const venueEn = extra > 0 ? `${venueLabel} +${extra} other venue${extra > 1 ? "s" : ""}` : venueLabel;
  const duration = formatMinutes(minutes);

  return {
    titleFr: `📅 Demain : ${count} RDV`,
    titleEn: `📅 Tomorrow: ${count} appointment${count > 1 ? "s" : ""}`,
    bodyFr: `Premier à ${firstTime}${venueFr ? ` — ${venueFr}` : ""}. ${duration} de soins.`,
    bodyEn: `First at ${firstTime}${venueEn ? ` — ${venueEn}` : ""}. ${duration} of treatments.`,
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
