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

    console.log('🧪 Starting push notification test...');

    // 1. Create test hotel if it doesn't exist
    const testHotelId = 'test-hotel-123';
    const { data: existingHotel } = await supabase
      .from('hotels')
      .select('id')
      .eq('id', testHotelId)
      .single();

    if (!existingHotel) {
      console.log('📍 Creating test hotel...');
      await supabase.from('hotels').insert({
        id: testHotelId,
        name: 'Hôtel Test Push',
        status: 'Active',
        currency: 'EUR',
        hairdresser_commission: 70,
        hotel_commission: 30,
        vat: 20,
      });
    }

    // 2. Create test user and hairdresser if they don't exist
    const testEmail = 'coiffeur.test@oom.app';
    const testPhone = '674678293';
    
    // Check if user exists
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    let testUser = existingUser?.users?.find(u => u.email === testEmail);

    if (!testUser) {
      console.log('👤 Creating test user...');
      const { data: newUser, error: userError } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: 'Test123456!',
        email_confirm: true,
      });
      
      if (userError) {
        console.error('Error creating user:', userError);
        throw userError;
      }
      testUser = newUser.user;
    }

    // Check if hairdresser exists
    const { data: existingHairdresser } = await supabase
      .from('hairdressers')
      .select('id')
      .eq('user_id', testUser.id)
      .single();

    let hairdresserId = existingHairdresser?.id;

    if (!existingHairdresser) {
      console.log('💇 Creating test hairdresser...');
      const { data: newHairdresser, error: hairdresserError } = await supabase
        .from('hairdressers')
        .insert({
          email: testEmail,
          first_name: 'Test',
          last_name: 'Coiffeur',
          phone: testPhone,
          country_code: '+33',
          status: 'Actif',
          user_id: testUser.id,
        })
        .select()
        .single();

      if (hairdresserError) {
        console.error('Error creating hairdresser:', hairdresserError);
        throw hairdresserError;
      }
      hairdresserId = newHairdresser.id;

      // Assign hairdresser to hotel
      await supabase.from('hairdresser_hotels').insert({
        hairdresser_id: hairdresserId,
        hotel_id: testHotelId,
      });

      // Assign hairdresser role
      await supabase.from('user_roles').insert({
        user_id: testUser.id,
        role: 'hairdresser',
      });
    }

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
          buffer_time: 10,
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
        hotel_name: 'Hôtel Test Push',
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
        hairdresser: {
          email: testEmail,
          phone: `+33${testPhone}`,
          message: 'Connectez-vous avec ce compte pour voir les notifications',
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
