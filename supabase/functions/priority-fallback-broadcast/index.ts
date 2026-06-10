// priority-fallback-broadcast
// Cron-driven (every minute) — re-broadcasts bookings whose priority
// exclusivity window has expired without accept/decline.
//
// Pipeline :
//   1. Find pending bookings with priority_lock_until < now()
//      AND priority_therapist_id IS NOT NULL
//      AND priority_fallback_triggered_at IS NULL.
//   2. Mark them as fallback-triggered to avoid double-broadcast.
//   3. Re-invoke trigger-new-booking-notifications with notifyAll=true.
//      The downstream function will detect that the lock is expired and
//      fall through to the normal broadcast (Phase 2) for the rest of the team.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    console.log("[PRIORITY-FALLBACK] Sweep starting...");

    const nowIso = new Date().toISOString();
    const { data: expired, error } = await supabase
      .from("bookings")
      .select("id, booking_id, priority_therapist_id, priority_lock_until")
      .eq("status", "pending")
      .not("priority_therapist_id", "is", null)
      .is("priority_fallback_triggered_at", null)
      .lt("priority_lock_until", nowIso);

    if (error) {
      throw new Error(`Error fetching expired priority locks: ${error.message}`);
    }

    if (!expired || expired.length === 0) {
      console.log("[PRIORITY-FALLBACK] No expired priority locks");
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[PRIORITY-FALLBACK] Found ${expired.length} expired lock(s)`);

    let processed = 0;
    for (const b of expired) {
      // Mark fallback as triggered BEFORE re-invoking — prevents the cron
      // from picking the same booking again on next tick if the broadcast
      // is still in flight.
      const { error: updateErr } = await supabase
        .from("bookings")
        .update({ priority_fallback_triggered_at: nowIso })
        .eq("id", b.id)
        .is("priority_fallback_triggered_at", null);

      if (updateErr) {
        console.error(`[PRIORITY-FALLBACK] Mark error for ${b.booking_id}:`, updateErr);
        continue;
      }

      try {
        const { error: invokeErr } = await supabase.functions.invoke(
          "trigger-new-booking-notifications",
          {
            body: { bookingId: b.id, notifyAll: true },
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
          }
        );
        if (invokeErr) {
          console.error(`[PRIORITY-FALLBACK] Invoke error for ${b.booking_id}:`, invokeErr);
        } else {
          processed++;
          console.log(`[PRIORITY-FALLBACK] Re-broadcasted booking ${b.booking_id}`);
        }
      } catch (err) {
        console.error(`[PRIORITY-FALLBACK] Invoke exception for ${b.booking_id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, expired: expired.length, processed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[PRIORITY-FALLBACK] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
