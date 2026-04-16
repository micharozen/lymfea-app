/**
 * Shared post-payment logic — used by both stripe-webhook and alma-webhook.
 *
 * Performs:
 *  1. Update booking payment_status to 'paid'
 *  2. Create hotel_ledger commission entries
 *  3. Send confirmation email to client
 *  4. Notify admins
 *  5. Trigger push notifications to therapists
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { brand } from './brand.ts';

interface MarkPaidOptions {
  bookingId: string;  // booking.id (UUID)
  siteUrl?: string;   // for email links
}

/**
 * Mark a booking as paid and run all downstream side effects
 * (ledger, email, notifications). Idempotent — skips if already paid.
 *
 * Returns true if the booking was actually updated (false if already paid).
 */
export async function markBookingAsPaid(
  supabase: SupabaseClient,
  opts: MarkPaidOptions,
): Promise<boolean> {
  const { bookingId, siteUrl } = opts;
  const LOG = '[MARK-BOOKING-PAID]';

  // ── 1. Fetch booking ──────────────────────────────────────────────────────
  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, booking_id, hotel_id, client_email, client_first_name, client_last_name, payment_status, total_price, booking_date, booking_time, room_number')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !booking) {
    console.error(`${LOG} Booking not found:`, bookingId, fetchErr);
    throw new Error(`Booking not found: ${bookingId}`);
  }

  // ── Idempotency guard ─────────────────────────────────────────────────────
  if (booking.payment_status === 'paid') {
    console.log(`${LOG} Booking ${booking.booking_id} already paid, skipping`);
    return false;
  }

  // ── 2. Update payment status ──────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ payment_status: 'paid' })
    .eq('id', booking.id);

  if (updateErr) {
    console.error(`${LOG} Failed to update payment status:`, updateErr);
    throw updateErr;
  }

  console.log(`${LOG} Booking ${booking.booking_id} confirmed as paid`);

  // ── 3. Fetch hotel info for commissions ───────────────────────────────────
  const { data: hotel } = await supabase
    .from('hotels')
    .select('name, currency, therapist_commission, hotel_commission')
    .eq('id', booking.hotel_id)
    .maybeSingle();

  // ── 4. Create ledger entries ──────────────────────────────────────────────
  try {
    const therapistCommissionPercent = hotel?.therapist_commission ?? 70;
    const hotelCommissionPercent = hotel?.hotel_commission ?? 10;
    const oomCommissionPercent = Math.max(0, 100 - therapistCommissionPercent - hotelCommissionPercent);
    const totalPrice = booking.total_price || 0;

    const oomAmount = (totalPrice * oomCommissionPercent) / 100;
    const hotelAmount = (totalPrice * hotelCommissionPercent) / 100;

    console.log(`${LOG} Commission breakdown: Hotel ${hotelCommissionPercent}% (${hotelAmount}€), ${brand.name} ${oomCommissionPercent}% (${oomAmount}€)`);

    const { error: oomLedgerErr } = await supabase
      .from('hotel_ledger')
      .insert({
        hotel_id: booking.hotel_id,
        booking_id: booking.id,
        amount: oomAmount,
        status: 'pending',
        description: `Commission ${brand.name} (${oomCommissionPercent}%) - Réservation #${booking.booking_id}`,
      });

    if (oomLedgerErr) {
      console.error(`${LOG} OOM ledger entry failed:`, oomLedgerErr);
    }

    if (hotelAmount > 0) {
      const { error: hotelLedgerErr } = await supabase
        .from('hotel_ledger')
        .insert({
          hotel_id: booking.hotel_id,
          booking_id: booking.id,
          amount: -hotelAmount,
          status: 'pending',
          description: `Commission Hôtel à payer (${hotelCommissionPercent}%) - Réservation #${booking.booking_id}`,
        });

      if (hotelLedgerErr) {
        console.error(`${LOG} Hotel commission ledger entry failed:`, hotelLedgerErr);
      }
    }
  } catch (ledgerErr) {
    console.error(`${LOG} Ledger entry error:`, ledgerErr);
  }

  // ── 5. Get treatment details for email ────────────────────────────────────
  const { data: bookingTreatments } = await supabase
    .from('booking_treatments')
    .select('treatment_id, treatment_menus(name, price, price_on_request)')
    .eq('booking_id', booking.id);

  const treatmentsForEmail = (bookingTreatments || []).map((bt: any) => ({
    name: bt.treatment_menus?.name,
    price: bt.treatment_menus?.price,
    isPriceOnRequest: !!bt.treatment_menus?.price_on_request,
  }));

  const currencyForEmail = (hotel?.currency || 'EUR').toUpperCase();

  // ── 6. Send confirmation email ────────────────────────────────────────────
  if (booking.client_email) {
    try {
      await supabase.functions.invoke('send-booking-confirmation', {
        body: {
          email: booking.client_email,
          bookingId: booking.id,
          bookingNumber: booking.booking_id.toString(),
          clientName: `${booking.client_first_name} ${booking.client_last_name}`,
          hotelName: hotel?.name,
          roomNumber: booking.room_number,
          bookingDate: booking.booking_date,
          bookingTime: booking.booking_time,
          treatments: treatmentsForEmail,
          totalPrice: booking.total_price,
          currency: currencyForEmail,
          siteUrl: siteUrl || '',
        },
      });
      console.log(`${LOG} Confirmation email sent to client`);
    } catch (emailErr) {
      console.error(`${LOG} Email error:`, emailErr);
    }
  }

  // ── 7. Notify admins ──────────────────────────────────────────────────────
  try {
    await supabase.functions.invoke('notify-admin-new-booking', {
      body: { bookingId: booking.id },
    });
    console.log(`${LOG} Admin notification sent`);
  } catch (adminErr) {
    console.error(`${LOG} Admin notification error:`, adminErr);
  }

  // ── 8. Trigger push notifications to therapists ───────────────────────────
  try {
    await supabase.functions.invoke('trigger-new-booking-notifications', {
      body: { bookingId: booking.id },
    });
    console.log(`${LOG} Push notifications triggered`);
  } catch (pushErr) {
    console.error(`${LOG} Push notification error:`, pushErr);
  }

  return true;
}
