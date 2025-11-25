import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      hotelId, 
      clientData, 
      bookingData, 
      treatments, 
      paymentMethod, 
      totalPrice 
    } = await req.json();

    console.log('Creating booking for hotel:', hotelId);

    // Validate required fields
    if (!hotelId || !clientData || !bookingData || !treatments || treatments.length === 0) {
      throw new Error('Missing required fields');
    }

    // Get hotel info
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('name')
      .eq('id', hotelId)
      .single();

    if (hotelError || !hotel) {
      throw new Error('Hotel not found');
    }

    // Create booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        hotel_id: hotelId,
        hotel_name: hotel.name,
        client_first_name: clientData.firstName,
        client_last_name: clientData.lastName,
        client_email: clientData.email,
        phone: clientData.phone,
        room_number: clientData.roomNumber,
        booking_date: bookingData.date,
        booking_time: bookingData.time,
        status: 'En attente',
        hairdresser_id: null,
        payment_method: paymentMethod,
        payment_status: paymentMethod === 'room' ? 'charged_to_room' : 'pending',
        total_price: totalPrice,
      })
      .select()
      .single();

    if (bookingError || !booking) {
      console.error('Booking creation error:', bookingError);
      throw new Error('Failed to create booking');
    }

    console.log('Booking created:', booking.id);

    // Create booking treatments
    const treatmentInserts = [];
    for (const treatment of treatments) {
      for (let i = 0; i < treatment.quantity; i++) {
        treatmentInserts.push({
          booking_id: booking.id,
          treatment_id: treatment.treatmentId,
        });
      }
    }

    const { error: treatmentsError } = await supabase
      .from('booking_treatments')
      .insert(treatmentInserts);

    if (treatmentsError) {
      console.error('Treatments creation error:', treatmentsError);
      // Note: booking is already created, so we continue
    }

    console.log('Booking treatments created');

    // The trigger notify_hairdressers_new_booking will automatically notify all hairdressers

    return new Response(
      JSON.stringify({ 
        success: true, 
        bookingId: booking.id,
        bookingNumber: booking.booking_id,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in create-client-booking:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
