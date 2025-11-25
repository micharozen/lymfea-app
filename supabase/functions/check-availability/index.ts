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
    const { hotelId, date } = await req.json();

    if (!hotelId || !date) {
      throw new Error('Missing hotelId or date');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`Checking availability for hotel ${hotelId} on ${date}`);

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
      .eq('hotel_id', hotelId)
      .eq('hairdressers.status', 'Actif');

    if (hairdressersError) {
      console.error('Error fetching hairdressers:', hairdressersError);
      throw hairdressersError;
    }

    if (!hairdressers || hairdressers.length === 0) {
      console.log('No active hairdressers found for hotel');
      return new Response(
        JSON.stringify({ availableSlots: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hairdresserIds = hairdressers.map(h => h.hairdresser_id);
    console.log(`Found ${hairdresserIds.length} active hairdressers`);

    // Get all bookings for these hairdressers on this date
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('booking_time, hairdresser_id')
      .eq('booking_date', date)
      .in('hairdresser_id', hairdresserIds)
      .in('status', ['Confirmé', 'En cours', 'En attente de validation']);

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      throw bookingsError;
    }

    console.log(`Found ${bookings?.length || 0} existing bookings`);

    // Generate all time slots (6AM to 11PM every 30 minutes)
    const timeSlots = [];
    for (let hour = 6; hour < 23; hour++) {
      for (let minute of [0, 30]) {
        const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        timeSlots.push(time24);
      }
    }

    // Check which slots have at least one available hairdresser
    const availableSlots = timeSlots.filter(slot => {
      // Count how many hairdressers are busy at this time
      const busyHairdressers = new Set(
        (bookings || [])
          .filter(b => b.booking_time === slot)
          .map(b => b.hairdresser_id)
      );

      // At least one hairdresser must be available
      const availableCount = hairdresserIds.length - busyHairdressers.size;
      return availableCount > 0;
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
