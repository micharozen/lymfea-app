import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Complétion quotidienne (cron 03:00 UTC) des bookings passés déjà payés.
// Remplace l'UPDATE SQL pur du cron initial : les résas facturées en chambre
// mais jamais finalisées (créées en admin avec charged_to_room, jamais soldées
// dans la PWA) passaient à 'completed' sans facture Stripe, sans avance
// thérapeute, sans ledger et sans charge PMS. On les route vers finalize-payment
// (mode room), qui fait tout ça — les autres statuts payés restent un simple
// passage à 'completed' (le paiement carte a déjà été finalisé par ailleurs,
// et le chemin 'card' de finalize-payment repasserait payment_status à 'pending').

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COMPLETABLE_PAYMENT_STATUSES = ['paid', 'charged_to_room', 'offert', 'pending_partner_billing'];
const TERMINAL_STATUSES = ['completed', 'cancelled', 'noshow', 'no_show', 'declined', 'expired', 'Annulé'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().slice(0, 10);

    const { data: bookings, error: fetchError } = await supabase
      .from('bookings')
      .select('id, booking_id, payment_status, total_price')
      .lt('booking_date', today)
      .in('payment_status', COMPLETABLE_PAYMENT_STATUSES)
      .not('status', 'in', `(${TERMINAL_STATUSES.map((s) => `"${s}"`).join(',')})`);

    if (fetchError) throw fetchError;

    const summary = { total: bookings?.length ?? 0, finalized: 0, completed: 0, finalize_failed: 0 };

    for (const booking of bookings ?? []) {
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
          // même pour ne pas laisser la résa bloquée (et être retentée chaque nuit).
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
