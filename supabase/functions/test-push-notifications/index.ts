import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🧪 Starting push notification test for Aaron Therapist...');

    // 1. Find Aaron Therapist
    const { data: aaronTherapist, error: findError } = await supabase
      .from('therapists')
      .select('id, user_id, first_name, last_name, email')
      .eq('email', 'test.coiffeur@oomworld.com')
      .single();

    if (findError || !aaronTherapist) {
      throw new Error('Aaron Therapist not found. Please make sure the therapist exists with email: test.coiffeur@oomworld.com');
    }

    console.log('✅ Found therapist:', aaronTherapist.first_name, aaronTherapist.last_name);

    // 2. Get Aaron's hotel
    const { data: hotelAssignment, error: hotelError } = await supabase
      .from('therapist_venues')
      .select('hotel_id')
      .eq('therapist_id', aaronTherapist.id)
      .limit(1)
      .single();

    if (hotelError || !hotelAssignment) {
      throw new Error('No hotel found for Aaron Therapist');
    }

    const testHotelId = hotelAssignment.hotel_id;
    console.log('✅ Hotel ID:', testHotelId);

    // Get hotel details
    const { data: hotelDetails } = await supabase
      .from('hotels')
      .select('name')
      .eq('id', testHotelId)
      .single();

    const therapistId = aaronTherapist.id;

    // 3. Create test treatment menu if it doesn't exist
    const { data: existingMenu } = await supabase
      .from('treatment_menus')
      .select('id')
      .eq('hotel_id', testHotelId)
      .limit(1)
      .single();

    let treatmentId = existingMenu?.id;

    if (!existingMenu) {
      console.log('💅 Creating test treatment menu...');
      const { data: newTreatment, error: treatmentError } = await supabase
        .from('treatment_menus')
        .insert({
          name: 'Coupe Test',
          description: 'Service de test pour notifications',
          category: 'Coupe',
          service_for: 'Homme',
          price: 50,
          duration: 30,
          lead_time: 10,
          hotel_id: testHotelId,
          status: 'Actif',
        })
        .select()
        .single();

      if (treatmentError) {
        console.error('Error creating treatment:', treatmentError);
        throw treatmentError;
      }
      treatmentId = newTreatment.id;
    }

    // 4. Create test booking
    console.log('📅 Creating test booking...');
    const bookingDate = new Date();
    bookingDate.setDate(bookingDate.getDate() + 1); // Tomorrow

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        hotel_id: testHotelId,
        hotel_name: hotelDetails?.name || 'Hôtel Test',
        client_first_name: 'Client',
        client_last_name: 'Test',
        client_email: 'client.test@example.com',
        phone: '+33612345678',
        room_number: '101',
        booking_date: bookingDate.toISOString().split('T')[0],
        booking_time: '14:00',
        status: 'En attente',
        total_price: 50,
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Error creating booking:', bookingError);
      throw bookingError;
    }

    console.log('📅 Booking created:', booking.id);

    // 5. Add treatment to booking
    await supabase.from('booking_treatments').insert({
      booking_id: booking.id,
      treatment_id: treatmentId,
    });

    console.log('💅 Treatment added to booking');

    // 6. Trigger push notifications
    console.log('🔔 Triggering push notifications...');
    const { data: notifResult, error: notifError } = await supabase.functions.invoke(
      'trigger-new-booking-notifications',
      {
        body: { bookingId: booking.id },
      }
    );

    if (notifError) {
      console.error('Error triggering notifications:', notifError);
    } else {
      console.log('✅ Notifications triggered:', notifResult);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test booking created and notifications sent!',
        booking: {
          id: booking.id,
          booking_id: booking.booking_id,
          hotel_name: booking.hotel_name,
          client_name: `${booking.client_first_name} ${booking.client_last_name}`,
          date: booking.booking_date,
          time: booking.booking_time,
        },
        therapist: {
          name: `${aaronTherapist.first_name} ${aaronTherapist.last_name}`,
          email: aaronTherapist.email,
        },
        notifications: notifResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in test:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
