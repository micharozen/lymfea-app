import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

function timeToMinutes(time: string): number {
  const parts = time.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/**
 * Checks if a booking time + duration overlaps with any active blocked slot
 * for the given hotel on the given date.
 * Returns true if the slot is blocked (booking should be rejected).
 *
 * Ne considère que les blocages portant sur TOUT le lieu (room_id IS NULL),
 * qu'ils soient récurrents hebdomadaires (block_date IS NULL) ou ponctuels
 * datés. Un blocage ciblant une salle précise laisse les autres salles
 * réservables : il ne peut pas se trancher ici sans rejouer l'allocation, et
 * c'est reserve_trunk_atomically qui le tranche, atomiquement.
 */
export async function isInBlockedSlot(
  supabase: SupabaseClient,
  hotelId: string,
  bookingDate: string,
  bookingTime: string,
  durationMinutes: number
): Promise<boolean> {
  const { data: blockedSlots, error } = await supabase
    .from('venue_blocked_slots')
    .select('start_time, end_time, days_of_week, block_date')
    .eq('hotel_id', hotelId)
    .eq('is_active', true)
    .is('room_id', null)
    .or(`block_date.is.null,block_date.eq.${bookingDate}`);

  if (error || !blockedSlots || blockedSlots.length === 0) {
    return false;
  }

  const dayOfWeek = new Date(bookingDate + 'T00:00:00').getDay();
  const bookingStartMinutes = timeToMinutes(bookingTime);
  const bookingEndMinutes = bookingStartMinutes + durationMinutes;

  return blockedSlots.some((block: any) => {
    // Un blocage daté vaut pour cette date seule (déjà filtré côté requête) ;
    // days_of_week ne s'applique qu'aux blocages récurrents.
    if (
      block.block_date === null &&
      block.days_of_week !== null &&
      !block.days_of_week.includes(dayOfWeek)
    ) {
      return false;
    }

    const blockStartMinutes = timeToMinutes(block.start_time);
    const blockEndMinutes = timeToMinutes(block.end_time);

    // Standard interval overlap: two intervals overlap iff one starts before the other ends
    return bookingStartMinutes < blockEndMinutes && bookingEndMinutes > blockStartMinutes;
  });
}
