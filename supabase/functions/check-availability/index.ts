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
    const { data: allHotelBookings, error: allBookingsError } = await supabase
      .from('bookings')
      .select('booking_time, hairdresser_id, status, trunk_id')
      .eq('booking_date', date)
      .eq('hotel_id', hotelId)
      .not('status', 'in', '("Annulé","Terminé","cancelled")');

    if (allBookingsError) {
      console.error('Error fetching hotel bookings:', allBookingsError);
      throw allBookingsError;
    }

    console.log(`Found ${allHotelBookings?.length || 0} active bookings for hotel on ${date}`);

    // Generate all time slots (6AM to 11PM every 30 minutes)
    const timeSlots = [];
    for (let hour = 6; hour < 23; hour++) {
      for (let minute of [0, 30]) {
        const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        timeSlots.push(time24);
      }
    }

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

      // Get bookings at this slot
      const bookingsAtSlot = (allHotelBookings || []).filter(b => b.booking_time === slot);

      // TRUNK CAPACITY CHECK: Count active bookings at this slot
      const activeBookingsCount = bookingsAtSlot.length;
      if (activeBookingsCount >= totalTrunks) {
        // All trunks are occupied at this time
        return false;
      }

      // HAIRDRESSER CHECK: At least one hairdresser must be free
      const busyHairdressers = new Set(
        bookingsAtSlot
          .filter(b => b.hairdresser_id !== null)
          .map(b => b.hairdresser_id)
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