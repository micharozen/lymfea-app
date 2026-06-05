import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { getPmsClient, buildPmsConfigFromRow } from "../_shared/pms-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
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

    console.log('[pms-post-charge] Processing booking:', bookingId);

    // Load booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, hotel_id, room_number, total_price, payment_method, booking_id, client_first_name, client_last_name, booking_date, booking_time')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[pms-post-charge] Booking not found:', bookingError);
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
      .select('pms_auto_charge_room, currency, timezone')
      .eq('id', booking.hotel_id)
      .single();

    if (!hotel?.pms_auto_charge_room) {
      return new Response(
        JSON.stringify({ success: false, error: 'PMS auto-charge not enabled', fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Load PMS config
    const { data: pmsConfig, error: configError } = await supabase
      .from('hotel_pms_configs')
      .select('*')
      .eq('hotel_id', booking.hotel_id)
      .single();

    if (configError || !pmsConfig) {
      console.error('[pms-post-charge] PMS config not found:', configError);
      await updateChargeStatus(supabase, bookingId, 'failed', null, 'PMS configuration not found');
      return new Response(
        JSON.stringify({ success: false, error: 'PMS configuration not found', fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const pmsType = pmsConfig.pms_type;
    const config = buildPmsConfigFromRow(pmsType, pmsConfig);
    const client = getPmsClient(pmsType, config);

    // Mark as pending
    await updateChargeStatus(supabase, bookingId, 'pending', null, null);

    // Step 1: Look up guest by room number to get reservationId
    const guest = await client.lookupGuestByRoom(booking.room_number);

    if (!guest) {
      console.error('[pms-post-charge] Guest not found for room:', booking.room_number);
      await updateChargeStatus(supabase, bookingId, 'failed', null, `No active guest found in room ${booking.room_number}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Guest not found in PMS', fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Step 2: Post charge
    const consumptionUtc = buildConsumptionUtc(booking.booking_date, booking.booking_time, hotel?.timezone);
    const chargeResult = await client.postCharge({
      hotelId: pmsConfig.pms_hotel_id || pmsConfig.hotel_id,
      reservationId: pmsType === 'mews' ? (guest.accountId || guest.reservationId) : guest.reservationId,
      linkedReservationId: guest.reservationId,
      consumptionUtc,
      amount: booking.total_price || 0,
      currency: hotel.currency || 'EUR',
      description: `Spa - Booking #${booking.booking_id} - ${booking.client_first_name} ${booking.client_last_name}`,
      referenceNumber: `LYM-${booking.booking_id}`,
    });

    if (!chargeResult.success) {
      console.error('[pms-post-charge] Charge failed:', chargeResult.error);
      await updateChargeStatus(supabase, bookingId, 'failed', null, chargeResult.error || 'Charge posting failed');
      return new Response(
        JSON.stringify({ success: false, error: chargeResult.error, fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Success
    console.log('[pms-post-charge] Charge posted successfully:', chargeResult.chargeId);
    await updateChargeStatus(supabase, bookingId, 'posted', chargeResult.chargeId || null, null);

    return new Response(
      JSON.stringify({ success: true, chargeId: chargeResult.chargeId, fallbackToManual: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[pms-post-charge] Error:', error);
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
    console.error('[pms-post-charge] Failed to update charge status:', error);
  }
}

function buildConsumptionUtc(
  bookingDate?: string | null,
  bookingTime?: string | null,
  timezone?: string | null,
): string | undefined {
  if (!bookingDate || !bookingTime) return undefined;

  const [year, month, day] = bookingDate.split('-').map(Number);
  const [hours, minutes, seconds = 0] = bookingTime.split(':').map(Number);
  if ([year, month, day, hours, minutes, seconds].some(Number.isNaN)) return undefined;

  const tz = timezone || 'UTC';
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  const tzRendered = new Date(utcGuess.toLocaleString('en-US', { timeZone: tz }));
  const offsetMs = utcGuess.getTime() - tzRendered.getTime();
  const utcDate = new Date(utcGuess.getTime() + offsetMs);

  if (Number.isNaN(utcDate.getTime())) return undefined;
  return utcDate.toISOString();
}
