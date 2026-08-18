import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/** Latence par défaut quand le lieu n'a rien réglé. */
const DEFAULT_DELAY_MINUTES = 10;
/** Filet : au-delà, la réservation est trop ancienne pour être encore escaladée. */
const MAX_AGE_HOURS = 48;
/** Garde-fou de volume : le cron passe toutes les minutes, la file reste courte. */
const MAX_BOOKINGS_PER_RUN = 50;

const MINUTE_MS = 60 * 1000;

interface WaveBooking {
  id: string;
  booking_id: number;
  hotel_id: string;
  guest_count: number;
  broadcast_wave: number;
  broadcast_wave_sent_at: string;
  booking_date: string;
  hotels: { therapist_escalation_delay_minutes: number | null } | null;
}

/**
 * Cron-only. Fait avancer les réservations en attente vers le groupe de
 * thérapeutes suivant lorsque le groupe courant n'a pas répondu dans le délai
 * du lieu. Le volet « escalade sur refus » n'est pas géré ici : il est immédiat
 * et porté par le re-broadcast de la PWA, puisque decline_booking retire le
 * praticien du vivier (bookings.declined_by).
 *
 * Idempotent : trigger-new-booking-notifications ne ré-horodate la vague que si
 * un push est réellement parti. Une réservation déjà sur son dernier groupe
 * cesse donc d'être reprise, sans quoi le cron bouclerait dessus chaque minute.
 */
serve(async (_req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const now = new Date();
    // Pré-filtre grossier : le délai exact est propre à chaque lieu, on ne peut
    // pas le mettre dans le WHERE. On borne sur la latence minimale possible
    // (1 min) puis on vérifie ligne à ligne.
    const coarseCutoff = new Date(now.getTime() - 1 * MINUTE_MS);
    const oldestAllowed = new Date(now.getTime() - MAX_AGE_HOURS * 60 * MINUTE_MS);

    const { data: bookings, error: fetchError } = await supabase
      .from("bookings")
      .select(
        "id, booking_id, hotel_id, guest_count, broadcast_wave, broadcast_wave_sent_at, booking_date, hotels(therapist_escalation_delay_minutes)",
      )
      .eq("status", "pending")
      .not("broadcast_wave", "is", null)
      .lt("broadcast_wave_sent_at", coarseCutoff.toISOString())
      .gt("broadcast_wave_sent_at", oldestAllowed.toISOString())
      .gte("booking_date", now.toISOString().slice(0, 10))
      .order("broadcast_wave_sent_at", { ascending: true })
      .limit(MAX_BOOKINGS_PER_RUN);

    if (fetchError) throw fetchError;

    const candidates = (bookings ?? []) as unknown as WaveBooking[];
    const skipped = { not_due: 0, fully_staffed: 0, exhausted: 0 };
    let escalated = 0;

    // Condition terminale : le dernier groupe du lieu a été sollicité, il n'y a plus
    // personne au-delà. Sans elle, la réservation resterait dans la file jusqu'à son
    // créneau et l'on rappellerait le broadcast à vide chaque minute.
    const maxPriorityByHotel = new Map<string, number>();
    if (candidates.length > 0) {
      const { data: venueLinks } = await supabase
        .from("therapist_venues")
        .select("hotel_id, priority")
        .in("hotel_id", [...new Set(candidates.map(b => b.hotel_id))]);
      for (const link of venueLinks ?? []) {
        const current = maxPriorityByHotel.get(link.hotel_id) ?? 1;
        maxPriorityByHotel.set(link.hotel_id, Math.max(current, link.priority ?? 1));
      }
    }

    // Une réservation déjà pourvue n'a plus à être escaladée. Un seul aller-retour
    // pour tout le lot plutôt qu'une requête par réservation.
    const staffedCount = new Map<string, number>();
    if (candidates.length > 0) {
      const { data: acceptedRows } = await supabase
        .from("booking_therapists")
        .select("booking_id")
        .eq("status", "accepted")
        .in("booking_id", candidates.map(b => b.id));
      for (const row of acceptedRows ?? []) {
        staffedCount.set(row.booking_id, (staffedCount.get(row.booking_id) ?? 0) + 1);
      }
    }

    for (const booking of candidates) {
      const delayMinutes = booking.hotels?.therapist_escalation_delay_minutes ?? DEFAULT_DELAY_MINUTES;
      const dueAt = new Date(booking.broadcast_wave_sent_at).getTime() + delayMinutes * MINUTE_MS;
      if (now.getTime() < dueAt) {
        skipped.not_due++;
        continue;
      }

      if ((staffedCount.get(booking.id) ?? 0) >= (booking.guest_count ?? 1)) {
        skipped.fully_staffed++;
        continue;
      }

      if (booking.broadcast_wave >= (maxPriorityByHotel.get(booking.hotel_id) ?? 1)) {
        skipped.exhausted++;
        continue;
      }

      const { error: invokeError } = await supabase.functions.invoke(
        "trigger-new-booking-notifications",
        {
          body: {
            bookingId: booking.id,
            notifyAll: true,
            // Une escalade est une affaire interne au lieu : le client a déjà reçu
            // sa confirmation et Slack a déjà annoncé la réservation à sa création.
            therapistsOnly: true,
            wave: booking.broadcast_wave + 1,
          },
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
        },
      );

      if (invokeError) {
        console.error(`[ESCALATE] Réservation #${booking.booking_id} : échec du broadcast`, invokeError);
        continue;
      }

      escalated++;
      console.log(`[ESCALATE] Réservation #${booking.booking_id} : groupe ${booking.broadcast_wave} → ${booking.broadcast_wave + 1}`);
    }

    console.log(`[ESCALATE] ${candidates.length} candidate(s), ${escalated} escaladée(s), ignorées:`, skipped);

    return new Response(
      JSON.stringify({ success: true, candidates: candidates.length, escalated, skipped }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[ESCALATE] Erreur:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
