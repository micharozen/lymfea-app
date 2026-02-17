import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hotelId, date, treatmentIds } = await req.json();

    if (!hotelId || !date) {
      throw new Error('Missing hotelId or date');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const _debug: Record<string, any> = {};
    console.log(`[DEBUG] ====== CHECK-AVAILABILITY START ======`);
    console.log(`[DEBUG] hotelId: ${hotelId}, date: ${date}, treatmentIds: ${JSON.stringify(treatmentIds)}`);
    _debug.input = { hotelId, date, treatmentIds };

    // Check if venue is deployed on this date
    const { data: isVenueAvailable, error: scheduleError } = await supabase
      .rpc('is_venue_available_on_date', {
        _hotel_id: hotelId,
        _check_date: date
      });

    console.log(`[DEBUG] is_venue_available_on_date result: ${isVenueAvailable}, error: ${JSON.stringify(scheduleError)}`);

    if (scheduleError) {
      console.error('Error checking venue schedule:', scheduleError);
    }

    _debug.isVenueAvailable = isVenueAvailable;
    _debug.scheduleError = scheduleError;

    // If venue is not deployed on this date, return no slots
    if (isVenueAvailable === false) {
      console.log(`[DEBUG] EARLY EXIT: venue not deployed on ${date}`);
      return new Response(
        JSON.stringify({
          availableSlots: [],
          reason: 'venue_not_deployed',
          _debug
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get hotel opening/closing hours and slot interval
    const { data: hotelData, error: hotelError } = await supabase
      .from('hotels')
      .select('opening_time, closing_time, slot_interval')
      .eq('id', hotelId)
      .single();

    if (hotelError) {
      console.error('Error fetching hotel:', hotelError);
    }

    // Parse hours, defaulting to 06:00 and 23:00 if not set
    const openingHour = hotelData?.opening_time
      ? parseInt(hotelData.opening_time.split(':')[0], 10)
      : 6;
    const closingHour = hotelData?.closing_time
      ? parseInt(hotelData.closing_time.split(':')[0], 10)
      : 23;

    const slotInterval = hotelData?.slot_interval || 30;

    console.log(`Venue hours: ${openingHour}:00 - ${closingHour}:00, slot interval: ${slotInterval}min`);
    _debug.hotelData = hotelData;
    _debug.openingHour = openingHour;
    _debug.closingHour = closingHour;
    _debug.slotInterval = slotInterval;

    // Fetch active blocked slots for this hotel
    const { data: blockedSlots, error: blockedSlotsError } = await supabase
      .from('venue_blocked_slots')
      .select('start_time, end_time, days_of_week')
      .eq('hotel_id', hotelId)
      .eq('is_active', true);

    console.log(`[DEBUG] blocked slots query result: data=${JSON.stringify(blockedSlots)}, error=${JSON.stringify(blockedSlotsError)}`);

    if (blockedSlotsError) {
      console.error('Error fetching blocked slots:', blockedSlotsError);
    }

    // Get day of week for the requested date (0=Sunday, matches PostgreSQL DOW and JS getDay())
    const requestedDayOfWeek = new Date(date + 'T00:00:00').getDay();

    console.log(`[DEBUG] requestedDayOfWeek: ${requestedDayOfWeek}, blockedSlots count: ${blockedSlots?.length || 0}`);

    // Get the maximum lead_time from selected treatments (if provided)
    let maxLeadTime = 0;
    if (treatmentIds && treatmentIds.length > 0) {
      const { data: treatments, error: treatmentsError } = await supabase
        .from('treatment_menus')
        .select('lead_time')
        .in('id', treatmentIds);
      
      if (treatmentsError) {
        console.error('Error fetching treatments:', treatmentsError);
      } else if (treatments && treatments.length > 0) {
        maxLeadTime = Math.max(...treatments.map(t => t.lead_time || 0));
        console.log(`Maximum lead_time from selected treatments: ${maxLeadTime} minutes`);
      }
    }

    // Get all active hairdressers for this hotel
    const { data: hairdressers, error: hairdressersError } = await supabase
      .from('hairdresser_hotels')
      .select(`
        hairdresser_id,
        hairdressers!inner(
          id,
          status
        )
      `)
      .eq('hotel_id', hotelId);

    console.log(`[DEBUG] hairdresser_hotels raw result: ${JSON.stringify(hairdressers)}, error: ${JSON.stringify(hairdressersError)}`);
    _debug.hairdressersRaw = hairdressers;
    _debug.hairdressersError = hairdressersError;

    // Filter active hairdressers (case-insensitive)
    const activeHairdressers = hairdressers?.filter((h: any) =>
      h.hairdressers?.status?.toLowerCase() === 'active'
    ) || [];

    console.log(`[DEBUG] activeHairdressers after filter: ${JSON.stringify(activeHairdressers)}`);
    _debug.activeHairdressers = activeHairdressers;

    if (hairdressersError) {
      console.error('Error fetching hairdressers:', hairdressersError);
      throw hairdressersError;
    }

    // Get trunk count for this hotel (CAPACITY CONSTRAINT)
    const { data: trunks, error: trunksError } = await supabase
      .from('trunks')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('status', 'active');

    if (trunksError) {
      console.error('Error fetching trunks:', trunksError);
      throw trunksError;
    }

    const totalTrunks = trunks?.length || 0;
    console.log(`[DEBUG] trunks: ${JSON.stringify(trunks)}, totalTrunks: ${totalTrunks}`);
    _debug.trunks = trunks;
    _debug.totalTrunks = totalTrunks;

    // If no trunks, no availability
    if (totalTrunks === 0) {
      console.log('[DEBUG] EARLY EXIT: no active trunks');
      _debug.earlyExit = 'no_active_trunks';
      return new Response(
        JSON.stringify({ availableSlots: [], _debug }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!activeHairdressers || activeHairdressers.length === 0) {
      console.log('[DEBUG] EARLY EXIT: no active hairdressers');
      _debug.earlyExit = 'no_active_hairdressers';
      return new Response(
        JSON.stringify({ availableSlots: [], _debug }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hairdresserIds = activeHairdressers.map((h: any) => h.hairdresser_id);
    console.log(`Found ${hairdresserIds.length} active hairdressers`);

    // Get all bookings for this hotel on this date (for trunk capacity check)
    // Exclude cancelled/terminated bookings
    // Include duration for overlap checking
    const { data: allHotelBookings, error: allBookingsError } = await supabase
      .from('bookings')
      .select('booking_time, hairdresser_id, status, trunk_id, duration')
      .eq('booking_date', date)
      .eq('hotel_id', hotelId)
      .not('status', 'in', '("Annulé","Terminé","cancelled")');

    if (allBookingsError) {
      console.error('Error fetching hotel bookings:', allBookingsError);
      throw allBookingsError;
    }

    console.log(`[DEBUG] active bookings on ${date}: ${JSON.stringify(allHotelBookings)}`);
    _debug.activeBookings = allHotelBookings;

    // Helper function to convert time string to minutes
    const timeToMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    // Function to check if a slot is blocked by an existing booking (considering duration)
    const isSlotBlockedByBooking = (
      slotTime: string,
      bookingTime: string,
      bookingDuration: number
    ): boolean => {
      const slotMinutes = timeToMinutes(slotTime);
      const bookingStartMinutes = timeToMinutes(bookingTime);
      const bookingEndMinutes = bookingStartMinutes + (bookingDuration || 30);

      // The slot is blocked if it falls during the booking duration
      return slotMinutes >= bookingStartMinutes && slotMinutes < bookingEndMinutes;
    };

    // Function to check if a slot overlaps with any blocked time range
    const isSlotInBlockedRange = (slotTime: string): boolean => {
      if (!blockedSlots || blockedSlots.length === 0) return false;

      const slotStartMinutes = timeToMinutes(slotTime);
      const slotEndMinutes = slotStartMinutes + slotInterval;

      return blockedSlots.some((block: any) => {
        // Check day of week applicability
        if (block.days_of_week !== null && !block.days_of_week.includes(requestedDayOfWeek)) {
          return false;
        }

        const blockStartMinutes = timeToMinutes(block.start_time);
        const blockEndMinutes = timeToMinutes(block.end_time);

        // A slot is blocked if any part of it overlaps with the blocked range
        return slotStartMinutes < blockEndMinutes && slotEndMinutes > blockStartMinutes;
      });
    };

    // Generate time slots based on venue opening hours and slot interval
    const timeSlots = [];
    const openingMinutes = openingHour * 60;
    const closingMinutes = closingHour * 60;
    for (let minutes = openingMinutes; minutes < closingMinutes; minutes += slotInterval) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const time24 = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
      timeSlots.push(time24);
    }

    console.log(`[DEBUG] generated ${timeSlots.length} time slots: ${openingHour}:00 - ${closingHour}:00 => [${timeSlots[0]} ... ${timeSlots[timeSlots.length - 1]}]`);

    // Calculate the earliest bookable time based on lead_time
    const now = new Date();
    const requestedDate = new Date(date);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isToday = requestedDate.getTime() === today.getTime();
    
    let earliestBookableTime: string | null = null;
    if (isToday && maxLeadTime > 0) {
      // Add lead_time to current time
      const earliestTime = new Date(now.getTime() + maxLeadTime * 60 * 1000);
      const earliestHour = earliestTime.getHours();
      const earliestMinute = earliestTime.getMinutes();
      // Round up to next slot interval
      const totalEarliestMinutes = earliestHour * 60 + earliestMinute;
      const roundedMinutes = Math.ceil(totalEarliestMinutes / slotInterval) * slotInterval;
      const roundedHour = Math.floor(roundedMinutes / 60);
      const roundedMinute = roundedMinutes % 60;
      earliestBookableTime = `${roundedHour.toString().padStart(2, '0')}:${roundedMinute.toString().padStart(2, '0')}:00`;
      console.log(`Lead time filter: earliest bookable slot is ${earliestBookableTime} (current time + ${maxLeadTime} min)`);
    }

    // Check which slots have availability (both hairdresser AND trunk)
    const availableSlots = timeSlots.filter(slot => {
      // Filter out slots that fall in blocked time ranges (e.g., lunch breaks)
      if (isSlotInBlockedRange(slot)) {
        return false;
      }

      // Filter out slots that are too soon based on lead_time (only for today)
      if (isToday && earliestBookableTime && slot < earliestBookableTime) {
        return false;
      }

      // Get bookings that block this slot (considering duration overlap)
      const bookingsBlockingSlot = (allHotelBookings || []).filter((b: any) =>
        isSlotBlockedByBooking(slot, b.booking_time, b.duration || 30)
      );

      // TRUNK CAPACITY CHECK: Count bookings blocking this slot
      const activeBookingsCount = bookingsBlockingSlot.length;
      if (activeBookingsCount >= totalTrunks) {
        // All trunks are occupied at this time
        return false;
      }

      // HAIRDRESSER CHECK: At least one hairdresser must be free
      const busyHairdressers = new Set(
        bookingsBlockingSlot
          .filter((b: any) => b.hairdresser_id !== null)
          .map((b: any) => b.hairdresser_id)
      );

      const availableHairdresserCount = hairdresserIds.length - busyHairdressers.size;
      return availableHairdresserCount > 0;
    });

    console.log(`[DEBUG] ====== RESULT: ${availableSlots.length} available out of ${timeSlots.length} ======`);
    _debug.timeSlotsGenerated = timeSlots.length;
    _debug.isToday = isToday;
    _debug.earliestBookableTime = earliestBookableTime;
    _debug.now = now.toISOString();
    _debug.blockedSlotsData = blockedSlots;
    _debug.hairdresserIds = hairdresserIds;

    return new Response(
      JSON.stringify({ availableSlots, _debug }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-availability:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});