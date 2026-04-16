import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createAlmaPayment } from "../_shared/alma-client.ts";
import { isInBlockedSlot } from "../_shared/blocked-slots.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      hotelId,
      clientData,
      bookingData,
      treatments: treatmentsPayload,
      treatmentIds,
      installmentsCount,
      therapistGender,
    } = await req.json();

    // ─── Validation ─────────────────────────────────────────────────────────
    if (!hotelId || !clientData || !bookingData) {
      throw new Error("Missing required data");
    }
    if (!clientData.firstName || !clientData.lastName || !clientData.phone || !clientData.email) {
      throw new Error("Missing required client information");
    }
    if (![2, 3, 4].includes(installmentsCount)) {
      throw new Error("installmentsCount must be 2, 3 or 4");
    }

    const effectiveTreatmentIds: string[] =
      treatmentIds || (treatmentsPayload || []).map((t: any) => t.treatmentId);

    if (!Array.isArray(effectiveTreatmentIds) || effectiveTreatmentIds.length === 0) {
      throw new Error("At least one treatment is required");
    }

    // ─── Server-side price validation ───────────────────────────────────────
    const { data: treatments, error: treatmentsError } = await supabaseAdmin
      .from('treatment_menus')
      .select('id, name, price, hotel_id, status, duration')
      .in('id', effectiveTreatmentIds);

    if (treatmentsError || !treatments || treatments.length === 0) {
      throw new Error("Failed to fetch valid treatments");
    }

    const invalidTreatments = treatments.filter(
      (t) => (t.hotel_id !== null && t.hotel_id !== hotelId) || t.status !== 'active',
    );
    if (invalidTreatments.length > 0) {
      throw new Error("Some treatments are not available for this hotel");
    }

    const verifiedTotalPrice = treatments.reduce((sum, t) => sum + (t.price || 0), 0);
    const totalDuration = treatments.reduce((sum, t) => sum + (t.duration || 0), 0) || 30;

    if (verifiedTotalPrice <= 0) {
      throw new Error("Invalid total price calculated");
    }

    // ─── Hotel validation ───────────────────────────────────────────────────
    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from('hotels')
      .select('currency, name, offert, opening_time, closing_time')
      .eq('id', hotelId)
      .maybeSingle();

    if (hotelError || !hotel) {
      throw new Error("Hotel not found");
    }
    if (hotel.offert) {
      throw new Error("Ce lieu propose actuellement des soins offerts.");
    }

    // Opening hours validation
    if (hotel.opening_time && hotel.closing_time) {
      const bookingMinutes =
        parseInt(bookingData.time.split(':')[0]) * 60 +
        parseInt(bookingData.time.split(':')[1]);
      const openMinutes =
        parseInt(hotel.opening_time.split(':')[0]) * 60 +
        parseInt(hotel.opening_time.split(':')[1]);
      const closeMinutes =
        parseInt(hotel.closing_time.split(':')[0]) * 60 +
        parseInt(hotel.closing_time.split(':')[1]);
      if (bookingMinutes < openMinutes || bookingMinutes >= closeMinutes) {
        return new Response(
          JSON.stringify({ error: 'BLOCKED_SLOT' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
        );
      }
    }

    // Blocked slots validation
    if (await isInBlockedSlot(supabaseAdmin, hotelId, bookingData.date, bookingData.time, totalDuration)) {
      return new Response(
        JSON.stringify({ error: 'BLOCKED_SLOT' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    // ─── Create booking in awaiting_payment status ──────────────────────────
    const { data: newBooking, error: bookingError } = await supabaseAdmin.rpc(
      'create_client_booking_v2',
      {
        _hotel_id: hotelId,
        _first_name: clientData.firstName,
        _last_name: clientData.lastName,
        _phone: clientData.phone,
        _email: clientData.email,
        _room_number: clientData.roomNumber || null,
        _note: clientData.note || '',
        _booking_date: bookingData.date,
        _booking_time: bookingData.time,
        _treatment_ids: effectiveTreatmentIds,
        _total_price: verifiedTotalPrice,
        _payment_method: 'alma',
        _payment_status: 'awaiting_payment',
        _therapist_gender: therapistGender || null,
      },
    );

    let bookingId: string;

    if (bookingError || !newBooking) {
      // Fallback: direct insert if RPC not available
      console.log('[ALMA-CREATE-PAYMENT] RPC fallback, inserting booking directly');

      const { data: directBooking, error: directError } = await supabaseAdmin
        .from('bookings')
        .insert({
          hotel_id: hotelId,
          hotel_name: hotel.name,
          client_first_name: clientData.firstName,
          client_last_name: clientData.lastName,
          phone: clientData.phone,
          client_email: clientData.email,
          room_number: clientData.roomNumber || null,
          note: clientData.note || '',
          booking_date: bookingData.date,
          booking_time: bookingData.time,
          total_price: verifiedTotalPrice,
          payment_method: 'alma',
          payment_status: 'awaiting_payment',
          status: 'En attente',
        })
        .select('id, booking_id')
        .single();

      if (directError || !directBooking) {
        console.error('[ALMA-CREATE-PAYMENT] Booking insert failed:', directError);
        throw new Error('Failed to create booking');
      }

      bookingId = directBooking.id;

      // Insert booking_treatments
      const treatmentInserts = effectiveTreatmentIds.map((tid: string) => ({
        booking_id: bookingId,
        treatment_id: tid,
      }));
      await supabaseAdmin.from('booking_treatments').insert(treatmentInserts);
    } else {
      bookingId = typeof newBooking === 'string' ? newBooking : (newBooking as any).booking_id || (newBooking as any).id;
    }

    console.log(`[ALMA-CREATE-PAYMENT] Booking created: ${bookingId}`);

    // ─── Create booking_payment_infos row ───────────────────────────────────
    const { error: paymentInfoErr } = await supabaseAdmin
      .from('booking_payment_infos')
      .insert({
        booking_id: bookingId,
        provider: 'alma',
        alma_installments_count: installmentsCount,
        estimated_price: verifiedTotalPrice,
        payment_status: 'pending',
      });

    if (paymentInfoErr) {
      console.error('[ALMA-CREATE-PAYMENT] booking_payment_infos insert error:', paymentInfoErr);
    }

    // ─── Create Alma payment ────────────────────────────────────────────────
    const origin = req.headers.get('origin') || Deno.env.get('SITE_URL') || 'http://localhost:5173';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    const almaPayment = await createAlmaPayment({
      payment: {
        purchase_amount: Math.round(verifiedTotalPrice * 100),
        installments_count: installmentsCount,
        return_url: `${origin}/client/${hotelId}/confirmation/${bookingId}`,
        ipn_callback_url: `${supabaseUrl}/functions/v1/alma-webhook`,
        custom_data: {
          booking_id: bookingId,
          hotel_id: hotelId,
          source: 'client_flow',
        },
        locale: 'fr',
      },
      customer: {
        first_name: clientData.firstName,
        last_name: clientData.lastName,
        email: clientData.email,
        phone: clientData.phone,
      },
    });

    console.log(`[ALMA-CREATE-PAYMENT] Alma payment created: ${almaPayment.id}`);

    // ─── Store Alma payment ID ──────────────────────────────────────────────
    await supabaseAdmin
      .from('booking_payment_infos')
      .update({ alma_payment_id: almaPayment.id })
      .eq('booking_id', bookingId);

    return new Response(
      JSON.stringify({
        url: almaPayment.url,
        paymentId: almaPayment.id,
        bookingId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ALMA-CREATE-PAYMENT] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
