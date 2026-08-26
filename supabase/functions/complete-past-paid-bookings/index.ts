import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { venueLocalToUtc } from "../_shared/venue-time.ts";

// Complétion horaire des bookings déjà payés dont le soin est terminé.
// Remplace l'UPDATE SQL pur du cron initial : les résas facturées en chambre
// mais jamais finalisées (créées en admin avec charged_to_room, jamais soldées
// dans la PWA) passaient à 'completed' sans facture Stripe, sans avance
// thérapeute, sans ledger et sans charge PMS. On les route vers finalize-payment
// (mode room), qui fait tout ça — les autres statuts payés restent un simple
// passage à 'completed' (le paiement carte a déjà été finalisé par ailleurs,
// et le chemin 'card' de finalize-payment repasserait payment_status à 'pending').
//
// Fenêtre glissante : le cron tournait à 03:00 sur `booking_date < today`, donc
// la clôture du jour affichait 0 € jusqu'au lendemain matin. Il tourne désormais
// toutes les heures et ne retient que les résas dont la FIN du soin remonte à
// plus de COMPLETION_GRACE_MINUTES — l'heure de fin étant du wall-clock local au
// lieu, elle est résolue en instant absolu via le fuseau du lieu.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COMPLETABLE_PAYMENT_STATUSES = ['paid', 'charged_to_room', 'offert', 'pending_partner_billing'];
const TERMINAL_STATUSES = ['completed', 'cancelled', 'noshow', 'no_show', 'declined', 'expired', 'Annulé'];

/** Délai après la fin du soin avant complétion automatique. */
const COMPLETION_GRACE_MINUTES = 60;

/**
 * Durée retenue quand la résa n'en porte aucune : volontairement haute pour ne
 * pas finaliser un long soin avant son terme réel.
 */
const FALLBACK_DURATION_MINUTES = 90;

const DEFAULT_TIMEZONE = 'Europe/Paris';

interface CompletionCandidate {
  id: string;
  booking_id: number;
  payment_status: string | null;
  total_price: number | null;
  booking_date: string;
  booking_time: string;
  duration: number | null;
  hotel_id: string | null;
}

/**
 * Instant absolu auquel le soin se termine, dans le fuseau du lieu.
 * `null` quand la date/heure est inexploitable — la résa est alors ignorée
 * plutôt que finalisée à tort.
 */
function treatmentEndsAt(booking: CompletionCandidate, timezone: string): Date | null {
  const startsAt = venueLocalToUtc(booking.booking_date, booking.booking_time, timezone);
  if (!startsAt) return null;
  const minutes = booking.duration && booking.duration > 0
    ? booking.duration
    : FALLBACK_DURATION_MINUTES;
  return new Date(startsAt.getTime() + minutes * 60_000);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    // Borne haute large : un lieu à l'est de UTC peut être à J+1 en date locale.
    // Le tri fin réel se fait ensuite fuseau par fuseau.
    const horizon = new Date(now.getTime() + 24 * 3600_000).toISOString().slice(0, 10);

    const { data: candidates, error: fetchError } = await supabase
      .from('bookings')
      .select('id, booking_id, payment_status, total_price, booking_date, booking_time, duration, hotel_id')
      .lte('booking_date', horizon)
      .in('payment_status', COMPLETABLE_PAYMENT_STATUSES)
      .not('status', 'in', `(${TERMINAL_STATUSES.map((s) => `"${s}"`).join(',')})`);

    if (fetchError) throw fetchError;

    const pending = (candidates ?? []) as CompletionCandidate[];

    // Fuseau de chaque lieu concerné, en une requête.
    const hotelIds = [...new Set(pending.map((b) => b.hotel_id).filter(Boolean))] as string[];
    const timezones = new Map<string, string>();
    if (hotelIds.length) {
      const { data: hotels, error: hotelsError } = await supabase
        .from('hotels')
        .select('id, timezone')
        .in('id', hotelIds);
      if (hotelsError) throw hotelsError;
      for (const hotel of hotels ?? []) {
        timezones.set(hotel.id as string, (hotel.timezone as string | null) || DEFAULT_TIMEZONE);
      }
    }

    const graceMs = COMPLETION_GRACE_MINUTES * 60_000;
    const bookings = pending.filter((booking) => {
      const timezone = booking.hotel_id
        ? timezones.get(booking.hotel_id) ?? DEFAULT_TIMEZONE
        : DEFAULT_TIMEZONE;
      const endsAt = treatmentEndsAt(booking, timezone);
      if (!endsAt) return false;
      return now.getTime() >= endsAt.getTime() + graceMs;
    });

    const summary = {
      scanned: pending.length,
      total: bookings.length,
      finalized: 0,
      completed: 0,
      finalize_failed: 0,
    };

    for (const booking of bookings) {
      if (booking.payment_status === 'charged_to_room') {
        // Jamais finalisée (sinon status serait 'completed' et exclue de la
        // sélection) : finalize-payment fait facture + avance thérapeute +
        // ledger + notification concierge + charge PMS, et passe le status
        // à 'completed'.
        try {
          const { data, error } = await supabase.functions.invoke('finalize-payment', {
            body: {
              booking_id: booking.id,
              payment_method: 'room',
              final_amount: booking.total_price,
            },
          });
          if (error || !data?.success) {
            throw new Error(error?.message || data?.error || 'finalize-payment returned failure');
          }
          summary.finalized++;
          console.log(`[complete-past-paid-bookings] Finalized room booking #${booking.booking_id}`);
          continue;
        } catch (finalizeError: any) {
          // Dégradation vers le comportement historique : on complète quand
          // même pour ne pas laisser la résa bloquée (et être retentée à l'heure suivante).
          summary.finalize_failed++;
          console.error(
            `[complete-past-paid-bookings] finalize-payment failed for booking #${booking.booking_id}, falling back to plain complete:`,
            finalizeError.message,
          );
        }
      }

      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', booking.id);

      if (updateError) {
        console.error(`[complete-past-paid-bookings] Failed to complete booking #${booking.booking_id}:`, updateError.message);
      } else {
        summary.completed++;
      }
    }

    console.log('[complete-past-paid-bookings] Done', summary);

    return new Response(
      JSON.stringify({ success: true, ...summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('[complete-past-paid-bookings] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unexpected error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
