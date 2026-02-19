import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { lookupGuestByRoom, postChargeToRoom } from "../_shared/opera-cloud.ts";
import type { PmsConfig } from "../_shared/opera-cloud.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { bookingId } = await req.json();

    if (!bookingId) {
      return new Response(
        JSON.stringify({ success: false, error: 'bookingId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('[opera-cloud-post-charge] Processing booking:', bookingId);

    // Load booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, hotel_id, room_number, total_price, payment_method, booking_id, client_first_name, client_last_name')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[opera-cloud-post-charge] Booking not found:', bookingError);
      return new Response(
        JSON.stringify({ success: false, error: 'Booking not found', fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (booking.payment_method !== 'room') {
      return new Response(
        JSON.stringify({ success: false, error: 'Not a room payment', fallbackToManual: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (!booking.room_number) {
      return new Response(
        JSON.stringify({ success: false, error: 'No room number on booking', fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Check hotel has PMS auto-charge enabled
    const { data: hotel } = await supabase
      .from('hotels')
      .select('pms_auto_charge_room, currency')
      .eq('id', booking.hotel_id)
      .single();

    if (!hotel?.pms_auto_charge_room) {
      return new Response(
        JSON.stringify({ success: false, error: 'PMS auto-charge not enabled', fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Load PMS credentials
    const { data: pmsConfig, error: configError } = await supabase
      .from('hotel_pms_configs')
      .select('*')
      .eq('hotel_id', booking.hotel_id)
      .single();

    if (configError || !pmsConfig) {
      console.error('[opera-cloud-post-charge] PMS config not found:', configError);
      await updateChargeStatus(supabase, bookingId, 'failed', null, 'PMS configuration not found');
      return new Response(
        JSON.stringify({ success: false, error: 'PMS configuration not found', fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const operaConfig: PmsConfig = {
      gatewayUrl: pmsConfig.gateway_url,
      clientId: pmsConfig.client_id,
      clientSecret: pmsConfig.client_secret,
      appKey: pmsConfig.app_key,
      enterpriseId: pmsConfig.enterprise_id,
      pmsHotelId: pmsConfig.pms_hotel_id,
    };

    // Mark as pending
    await updateChargeStatus(supabase, bookingId, 'pending', null, null);

    // Step 1: Look up guest by room number to get reservationId
    const guest = await lookupGuestByRoom(operaConfig, booking.room_number);

    if (!guest) {
      console.error('[opera-cloud-post-charge] Guest not found for room:', booking.room_number);
      await updateChargeStatus(supabase, bookingId, 'failed', null, `No active guest found in room ${booking.room_number}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Guest not found in PMS', fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Step 2: Post charge to room folio
    const chargeResult = await postChargeToRoom(operaConfig, {
      hotelId: pmsConfig.pms_hotel_id,
      reservationId: guest.reservationId,
      amount: booking.total_price || 0,
      currency: hotel.currency || 'EUR',
      description: `Spa - Booking #${booking.booking_id} - ${booking.client_first_name} ${booking.client_last_name}`,
      referenceNumber: `LYM-${booking.booking_id}`,
    });

    if (!chargeResult.success) {
      console.error('[opera-cloud-post-charge] Charge failed:', chargeResult.error);
      await updateChargeStatus(supabase, bookingId, 'failed', null, chargeResult.error || 'Charge posting failed');
      return new Response(
        JSON.stringify({ success: false, error: chargeResult.error, fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Success
    console.log('[opera-cloud-post-charge] Charge posted successfully:', chargeResult.chargeId);
    await updateChargeStatus(supabase, bookingId, 'posted', chargeResult.chargeId || null, null);

    return new Response(
      JSON.stringify({ success: true, chargeId: chargeResult.chargeId, fallbackToManual: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[opera-cloud-post-charge] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unexpected error', fallbackToManual: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function updateChargeStatus(
  supabase: any,
  bookingId: string,
  status: string,
  chargeId: string | null,
  errorMessage: string | null,
) {
  const { error } = await supabase
    .from('bookings')
    .update({
      pms_charge_status: status,
      pms_charge_id: chargeId,
      pms_error_message: errorMessage,
    })
    .eq('id', bookingId);

  if (error) {
    console.error('[opera-cloud-post-charge] Failed to update charge status:', error);
  }
}
