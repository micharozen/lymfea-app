import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  enumerateDates,
  getVenueAvailability,
  type VenueAvailabilityOptions,
} from "../_shared/availability-query.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Real-time availability for a venue. Two modes on a single source of truth
 * (`getVenueAvailability`):
 *
 *   - Single date  → { date }      → { availableSlots: string[], reason? }
 *   - Date range   → { startDate, endDate } → { daysWithSlots: string[] }
 *
 * Replaces the former `check-availability` and `check-availability-range`.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      hotelId,
      date,
      startDate,
      endDate,
      treatmentIds,
      therapistGender,
      requiredGuestCount,
      excludeBookingId,
      pendingHolds,
      requestedDuration,
    } = body;

    if (!hotelId) return json({ error: "Missing hotelId" }, 400);

    const opts: VenueAvailabilityOptions = {
      treatmentIds,
      therapistGender,
      requiredGuestCount,
      excludeBookingId,
      pendingHolds,
      requestedDuration,
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Single-date mode.
    if (date) {
      const { slotsByDate, deployedDates } = await getVenueAvailability(
        supabase,
        hotelId,
        [date],
        opts,
      );
      if (!deployedDates.has(date)) {
        return json({ availableSlots: [], reason: "venue_not_deployed" });
      }
      return json({ availableSlots: slotsByDate.get(date) ?? [] });
    }

    // Range mode.
    if (startDate && endDate) {
      const dates = enumerateDates(startDate, endDate);
      const { slotsByDate } = await getVenueAvailability(supabase, hotelId, dates, opts);
      const daysWithSlots = dates.filter((d) => (slotsByDate.get(d)?.length ?? 0) > 0);
      return json({ daysWithSlots });
    }

    return json({ error: "Missing date or startDate/endDate" }, 400);
  } catch (error) {
    console.error("get-availability error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 400);
  }
});
