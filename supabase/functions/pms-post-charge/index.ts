import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getPmsClient, buildPmsConfigFromRow } from "../_shared/pms-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Hoisted so the global catch can mark the charge failed + notify Slack.
  let bookingId: string | undefined;
  let booking: any = null;
  let hotelName = '';
  let currency = 'EUR';

  try {
    const parsed = await req.json();
    bookingId = parsed.bookingId;

    if (!bookingId) {
      return new Response(
        JSON.stringify({ success: false, error: 'bookingId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('[pms-post-charge] Processing booking:', bookingId);

    // Load booking
    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .select('id, hotel_id, room_number, total_price, payment_method, booking_id, client_first_name, client_last_name, booking_date, booking_time')
      .eq('id', bookingId)
      .single();

    booking = bookingData;

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
      .select('name, pms_auto_charge_room, currency, timezone')
      .eq('id', booking.hotel_id)
      .single();

    hotelName = hotel?.name ?? '';
    currency = hotel?.currency || 'EUR';

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
      await notifyRoomChargeFailure(supabase, booking, hotelName, currency, 'PMS configuration not found');
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
      const guestErrorMessage = `No active guest found in room ${booking.room_number}`;
      await updateChargeStatus(supabase, bookingId, 'failed', null, guestErrorMessage);
      await notifyRoomChargeFailure(supabase, booking, hotelName, currency, guestErrorMessage);
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
      const chargeErrorMessage = chargeResult.error || 'Charge posting failed';
      await updateChargeStatus(supabase, bookingId, 'failed', null, chargeErrorMessage);
      await notifyRoomChargeFailure(supabase, booking, hotelName, currency, chargeErrorMessage);
      return new Response(
        JSON.stringify({ success: false, error: chargeResult.error, fallbackToManual: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Success
    console.log('[pms-post-charge] Charge posted successfully:', chargeResult.chargeId);
    await updateChargeStatus(supabase, bookingId, 'posted', chargeResult.chargeId || null, null);
    await markRoomChargePaid(supabase, booking);

    return new Response(
      JSON.stringify({ success: true, chargeId: chargeResult.chargeId, fallbackToManual: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[pms-post-charge] Error:', error);
    const errorMessage = error?.message || 'Unexpected error';
    // Mark the charge failed + notify only when we have a room booking in context.
    if (bookingId && booking?.payment_method === 'room') {
      await updateChargeStatus(supabase, bookingId, 'failed', null, errorMessage);
      await notifyRoomChargeFailure(supabase, booking, hotelName, currency, errorMessage);
    }
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, fallbackToManual: true }),
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

// Reflect a successful room charge on the payment object + booking status so the
// admin UI (booking banner) and dashboard alert clear automatically.
async function markRoomChargePaid(supabase: any, booking: any) {
  const { error: piError } = await supabase
    .from('booking_payment_infos')
    .upsert(
      {
        booking_id: booking.id,
        estimated_price: booking.total_price ?? null,
        payment_status: 'charged',
        payment_at: new Date().toISOString(),
        payment_error_message: null,
      },
      { onConflict: 'booking_id' },
    );

  if (piError) {
    console.error('[pms-post-charge] Failed to upsert payment info:', piError);
  }

  const { error: bookingError } = await supabase
    .from('bookings')
    .update({ payment_status: 'charged_to_room' })
    .eq('id', booking.id);

  if (bookingError) {
    console.error('[pms-post-charge] Failed to update booking payment status:', bookingError);
  }
}

// Notify the team on Slack when a room charge push fails (non-blocking).
async function notifyRoomChargeFailure(
  supabase: any,
  booking: any,
  hotelName: string,
  currency: string,
  errorMessage: string,
) {
  try {
    const clientName = `${booking?.client_first_name ?? ''} ${booking?.client_last_name ?? ''}`.trim();
    await supabase.functions.invoke('send-slack-notification', {
      body: {
        type: 'room_charge_failed',
        bookingId: booking?.id,
        bookingNumber: String(booking?.booking_id ?? ''),
        clientName: clientName || 'Client',
        hotelName: hotelName || 'Établissement',
        bookingDate: booking?.booking_date ?? '',
        bookingTime: booking?.booking_time ?? '',
        totalPrice: booking?.total_price ?? undefined,
        currency,
        roomNumber: booking?.room_number ?? undefined,
        pmsErrorMessage: errorMessage,
      },
    });
  } catch (notifyError) {
    console.error('[pms-post-charge] Failed to send Slack notification:', notifyError);
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
