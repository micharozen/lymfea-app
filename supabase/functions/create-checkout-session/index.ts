import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { isInBlockedSlot } from '../_shared/blocked-slots.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[CREATE-CHECKOUT] Starting checkout session creation");

    const { bookingData, clientData, treatmentIds, treatments: treatmentsPayload, hotelId, language, therapistGender } = await req.json();

    // Validate required fields
    if (!bookingData || !clientData || !hotelId) {
      throw new Error("Missing required data");
    }

    // Support both legacy treatmentIds array and new treatments array with variantId
    const effectiveTreatmentIds: string[] = treatmentIds || (treatmentsPayload || []).map((t: any) => t.treatmentId);
    const variantMap: Record<string, string> = {};
    if (treatmentsPayload) {
      for (const t of treatmentsPayload) {
        if (t.variantId) variantMap[t.treatmentId] = t.variantId;
      }
    }

    if (!Array.isArray(effectiveTreatmentIds) || effectiveTreatmentIds.length === 0) {
      throw new Error("At least one treatment is required");
    }

    // Validate client data
    if (!clientData.firstName || !clientData.lastName || !clientData.phone) {
      throw new Error("Missing required client information");
    }

    console.log("[CREATE-CHECKOUT] Data received:", {
      hotelId,
      treatmentIds: effectiveTreatmentIds,
      clientName: `${clientData.firstName} ${clientData.lastName}`
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // SECURITY: Fetch treatments from database to get verified prices and durations
    const { data: treatments, error: treatmentsError } = await supabase
      .from('treatment_menus')
      .select('id, name, price, hotel_id, status, duration')
      .in('id', effectiveTreatmentIds);

    if (treatmentsError) {
      console.error("[CREATE-CHECKOUT] Treatments fetch error:", treatmentsError);
      throw new Error("Failed to fetch treatments");
    }

    if (!treatments || treatments.length === 0) {
      throw new Error("No valid treatments found");
    }

    // SECURITY: Validate all treatments belong to the specified hotel and are active
    const invalidTreatments = treatments.filter(t =>
      (t.hotel_id !== null && t.hotel_id !== hotelId) || t.status !== 'active'
    );

    if (invalidTreatments.length > 0) {
      console.error("[CREATE-CHECKOUT] Invalid treatments detected:", invalidTreatments);
      throw new Error("Some treatments are not available for this hotel");
    }

    // SECURITY: Calculate total price server-side from verified database prices
    const verifiedTotalPrice = treatments.reduce((sum, t) => sum + (t.price || 0), 0);

    if (verifiedTotalPrice <= 0) {
      throw new Error("Invalid total price calculated");
    }

    const totalDuration = treatments.reduce((sum, t) => sum + (t.duration || 0), 0) || 30;

    console.log("[CREATE-CHECKOUT] Verified total price:", verifiedTotalPrice, "duration:", totalDuration);

    // Fetch hotel info for currency and opening hours
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('slug, currency, name, offert, opening_time, closing_time')
      .eq('id', hotelId)
      .maybeSingle();

    if (hotelError) {
      console.error("[CREATE-CHECKOUT] Hotel fetch error:", hotelError);
      throw hotelError;
    }

    if (!hotel) {
      throw new Error("Hotel not found");
    }

    // Block Stripe checkout for offert venues
    if (hotel.offert) {
      return new Response(
        JSON.stringify({ error: "Ce lieu propose actuellement des soins offerts. Utilisez la réservation directe." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Block checkout outside opening hours
    if (hotel.opening_time && hotel.closing_time) {
      const bookingMinutes = parseInt(bookingData.time.split(':')[0]) * 60 + parseInt(bookingData.time.split(':')[1]);
      const openMinutes = parseInt(hotel.opening_time.split(':')[0]) * 60 + parseInt(hotel.opening_time.split(':')[1]);
      const closeMinutes = parseInt(hotel.closing_time.split(':')[0]) * 60 + parseInt(hotel.closing_time.split(':')[1]);
      if (bookingMinutes < openMinutes || bookingMinutes >= closeMinutes) {
        console.log('[CREATE-CHECKOUT] Rejected: outside opening hours', bookingData.time);
        return new Response(
          JSON.stringify({ error: 'BLOCKED_SLOT' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // Block checkout for bookings that overlap with venue blocked slots (e.g., lunch breaks)
    if (await isInBlockedSlot(supabase, hotelId, bookingData.date, bookingData.time, totalDuration)) {
      console.log('[CREATE-CHECKOUT] Rejected: overlaps with blocked slot', bookingData.time, 'duration', totalDuration);
      return new Response(
        JSON.stringify({ error: 'BLOCKED_SLOT' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const currency = hotel?.currency?.toLowerCase() || 'eur';

    // PRE-RESERVE: Atomically reserve treatment room + create booking BEFORE Stripe payment
    // This prevents TOCTOU double-booking: Client B is blocked here, never reaches Stripe
    const { data: bookingId, error: rpcError } = await supabase.rpc('reserve_trunk_atomically', {
      _hotel_id: hotelId,
      _booking_date: bookingData.date,
      _booking_time: bookingData.time,
      _duration: totalDuration,
      _hotel_name: hotel.name,
      _client_first_name: clientData.firstName,
      _client_last_name: clientData.lastName,
      _client_email: clientData.email || null,
      _phone: clientData.phone,
      _room_number: clientData.roomNumber || null,
      _client_note: clientData.note || null,
      _status: 'pending',
      _payment_method: 'card',
      _payment_status: 'awaiting_payment',
      _total_price: verifiedTotalPrice,
      _language: language || 'fr',
      _treatment_ids: effectiveTreatmentIds,
      _therapist_gender: therapistGender || null,
    });

    if (rpcError) {
      if (rpcError.message?.includes('NO_TRUNK_AVAILABLE')) {
        console.log('[CREATE-CHECKOUT] Slot taken (atomic check)');
        return new Response(
          JSON.stringify({ error: 'SLOT_TAKEN' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
        );
      }
      console.error('[CREATE-CHECKOUT] RPC error:', rpcError);
      throw rpcError;
    }

    console.log("[CREATE-CHECKOUT] Pre-reservation created:", bookingId);

    // Add booking treatments
    for (const treatmentId of effectiveTreatmentIds) {
      const { error: treatmentError } = await supabase
        .from('booking_treatments')
        .insert({
          booking_id: bookingId,
          treatment_id: treatmentId,
          variant_id: variantMap[treatmentId] || null,
        });
      if (treatmentError) {
        console.error("[CREATE-CHECKOUT] Treatment insert error:", treatmentError);
      }
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Create treatment description for Stripe
    const treatmentNames = treatments.map(t => t.name).join(', ');

    // Validate email format before passing to Stripe
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmail = clientData.email && emailRegex.test(clientData.email) ? clientData.email : undefined;

    // Create Stripe Checkout session with verified server-side price
    // Stripe minimum session expiry is 30 min — the DB-level 4-min TTL handles real expiry
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: validEmail,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: 'Prestations bien-être',
              description: `${treatmentNames} - ${clientData.firstName} ${clientData.lastName}`,
            },
            unit_amount: Math.round(verifiedTotalPrice * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${req.headers.get("origin")}/client/${hotel.slug ?? hotelId}/confirmation/${bookingId}`,
      cancel_url: `${req.headers.get("origin")}/client/${hotel.slug ?? hotelId}/payment`,
      metadata: {
        booking_id: bookingId,
        hotel_id: hotelId,
        site_url: req.headers.get("origin") || "",
      },
    });

    // Store Stripe session ID on the pre-reserved booking for webhook lookup
    await supabase
      .from('bookings')
      .update({ stripe_invoice_url: session.id })
      .eq('id', bookingId);

    console.log("[CREATE-CHECKOUT] Stripe session created:", session.id);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-CHECKOUT] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
