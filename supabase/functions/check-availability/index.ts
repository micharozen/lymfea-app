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

    console.log(`Checking availability for hotel ${hotelId} on ${date}`);

    // Check if venue is deployed on this date
    const { data: isVenueAvailable, error: scheduleError } = await supabase
      .rpc('is_venue_available_on_date', {
        _hotel_id: hotelId,
        _check_date: date
      });

    if (scheduleError) {
      console.error('Error checking venue schedule:', scheduleError);
    }

    // If venue is not deployed on this date, return no slots
    if (isVenueAvailable === false) {
      console.log(`Venue ${hotelId} is not deployed on ${date}`);
      return new Response(
        JSON.stringify({
          availableSlots: [],
          reason: 'venue_not_deployed'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get hotel opening/closing hours
    const { data: hotelData, error: hotelError } = await supabase
      .from('hotels')
      .select('opening_time, closing_time')
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

    console.log(`Venue hours: ${openingHour}:00 - ${closingHour}:00`);

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

    // Filter active hairdressers (case-insensitive)
    const activeHairdressers = hairdressers?.filter((h: any) => 
      h.hairdressers?.status?.toLowerCase() === 'active'
    ) || [];

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
    console.log(`Hotel has ${totalTrunks} active trunks`);

    // If no trunks, no availability
    if (totalTrunks === 0) {
      console.log('No active trunks found for hotel - no availability');
      return new Response(
        JSON.stringify({ availableSlots: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!activeHairdressers || activeHairdressers.length === 0) {
      console.log('No active hairdressers found for hotel');
      return new Response(
        JSON.stringify({ availableSlots: [] }),
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

    console.log(`Found ${allHotelBookings?.length || 0} active bookings for hotel on ${date}`);

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

    // Generate time slots based on venue opening hours (every 30 minutes)
    const timeSlots = [];
    for (let hour = openingHour; hour < closingHour; hour++) {
      for (const minute of [0, 30]) {
        const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        timeSlots.push(time24);
      }
    }

    console.log(`Generated ${timeSlots.length} time slots from ${openingHour}:00 to ${closingHour}:00`);

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
      // Round up to next 30-minute slot
      const roundedMinute = earliestMinute < 30 ? 30 : 0;
      const roundedHour = earliestMinute < 30 ? earliestHour : earliestHour + 1;
      earliestBookableTime = `${roundedHour.toString().padStart(2, '0')}:${roundedMinute.toString().padStart(2, '0')}:00`;
      console.log(`Lead time filter: earliest bookable slot is ${earliestBookableTime} (current time + ${maxLeadTime} min)`);
    }

    // Check which slots have availability (both hairdresser AND trunk)
    const availableSlots = timeSlots.filter(slot => {
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

    console.log(`${availableSlots.length} slots available out of ${timeSlots.length}`);

    return new Response(
      JSON.stringify({ availableSlots }),
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