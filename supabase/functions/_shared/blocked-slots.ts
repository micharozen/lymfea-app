import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

function timeToMinutes(time: string): number {
  const parts = time.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/**
 * Checks if a booking time + duration overlaps with any active blocked slot
 * for the given hotel on the given date.
 * Returns true if the slot is blocked (booking should be rejected).
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
    .select('start_time, end_time, days_of_week')
    .eq('hotel_id', hotelId)
    .eq('is_active', true);

  if (error || !blockedSlots || blockedSlots.length === 0) {
    return false;
  }

  const dayOfWeek = new Date(bookingDate + 'T00:00:00').getDay();
  const bookingStartMinutes = timeToMinutes(bookingTime);
  const bookingEndMinutes = bookingStartMinutes + durationMinutes;

  return blockedSlots.some((block: any) => {
    // Check day of week applicability (null = every day)
    if (block.days_of_week !== null && !block.days_of_week.includes(dayOfWeek)) {
      return false;
    }

    const blockStartMinutes = timeToMinutes(block.start_time);
    const blockEndMinutes = timeToMinutes(block.end_time);

    // Standard interval overlap: two intervals overlap iff one starts before the other ends
    return bookingStartMinutes < blockEndMinutes && bookingEndMinutes > blockStartMinutes;
  });
}
