import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schemas
const clientDataSchema = z.object({
  firstName: z.string()
    .min(1, 'First name is required')
    .max(100, 'First name must be less than 100 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s\-']+$/, 'First name contains invalid characters'),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be less than 100 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s\-']+$/, 'Last name contains invalid characters'),
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email must be less than 255 characters')
    .optional()
    .or(z.literal('')),
  phone: z.string()
    .min(6, 'Phone number is too short')
    .max(20, 'Phone number is too long')
    .regex(/^[\d\s\+\-\(\)]+$/, 'Phone number contains invalid characters'),
  roomNumber: z.string()
    .max(20, 'Room number must be less than 20 characters')
    .optional()
    .or(z.literal('')),
  note: z.string()
    .max(500, 'Note must be less than 500 characters')
    .optional()
    .or(z.literal('')),
});

const bookingDataSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected YYYY-MM-DD)'),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time format (expected HH:MM)'),
});

const treatmentSchema = z.object({
  treatmentId: z.string().uuid('Invalid treatment ID format'),
  quantity: z.number().int().min(1).max(10, 'Quantity must be between 1 and 10'),
});

const requestSchema = z.object({
  hotelId: z.string().min(1, 'Hotel ID is required'),
  clientData: clientDataSchema,
  bookingData: bookingDataSchema,
  treatments: z.array(treatmentSchema).min(1, 'At least one treatment is required').max(20, 'Maximum 20 treatments allowed'),
  paymentMethod: z.enum(['room', 'card', 'cash']).optional().default('room'),
  totalPrice: z.number().min(0, 'Total price must be positive').max(100000, 'Total price exceeds maximum'),
});

// Sanitize string to prevent injection
function sanitizeString(str: string): string {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

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

    // Parse and validate request body
    const rawBody = await req.json();
    
    const validationResult = requestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error.issues);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Validation failed',
          details: validationResult.error.issues.map(i => i.message)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const { 
      hotelId, 
      clientData, 
      bookingData, 
      treatments, 
      paymentMethod, 
      totalPrice 
    } = validationResult.data;

    console.log('Creating booking for hotel:', hotelId);

    // Sanitize user-provided strings
    const sanitizedClientData = {
      firstName: sanitizeString(clientData.firstName),
      lastName: sanitizeString(clientData.lastName),
      email: clientData.email ? sanitizeString(clientData.email) : null,
      phone: sanitizeString(clientData.phone),
      roomNumber: clientData.roomNumber ? sanitizeString(clientData.roomNumber) : null,
      note: clientData.note ? sanitizeString(clientData.note) : null,
    };

    // Get hotel info
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('name')
      .eq('id', hotelId)
      .single();

    if (hotelError || !hotel) {
      console.error('Hotel lookup error:', hotelError);
      return new Response(
        JSON.stringify({ success: false, error: 'Hotel not found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    // Validate that all treatment IDs exist
    const treatmentIds = treatments.map(t => t.treatmentId);
    const { data: validTreatments, error: treatmentValidationError } = await supabase
      .from('treatment_menus')
      .select('id')
      .in('id', treatmentIds);

    if (treatmentValidationError) {
      console.error('Treatment validation error:', treatmentValidationError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to validate treatments' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const validTreatmentIds = new Set(validTreatments?.map(t => t.id) || []);
    const invalidTreatments = treatmentIds.filter(id => !validTreatmentIds.has(id));
    
    if (invalidTreatments.length > 0) {
      console.error('Invalid treatment IDs:', invalidTreatments);
      return new Response(
        JSON.stringify({ success: false, error: 'One or more treatments are invalid' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Create booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        hotel_id: hotelId,
        hotel_name: hotel.name,
        client_first_name: sanitizedClientData.firstName,
        client_last_name: sanitizedClientData.lastName,
        client_email: sanitizedClientData.email,
        phone: sanitizedClientData.phone,
        room_number: sanitizedClientData.roomNumber,
        client_note: sanitizedClientData.note,
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
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create booking' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
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

    // Get treatment names and prices for email
    const { data: treatmentDetails } = await supabase
      .from('treatment_menus')
      .select('name, price')
      .in('id', treatmentIds);

    // Format treatments with name and price separated properly
    const treatmentNames = treatmentDetails?.map(t => `${t.name} - ${t.price}€`) || [];

    // Send confirmation email
    if (sanitizedClientData.email) {
      try {
        const emailResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-confirmation`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({
              email: sanitizedClientData.email,
              bookingId: booking.id,
              bookingNumber: booking.booking_id.toString(),
              clientName: `${sanitizedClientData.firstName} ${sanitizedClientData.lastName}`,
              hotelName: hotel.name,
              roomNumber: sanitizedClientData.roomNumber,
              bookingDate: bookingData.date,
              bookingTime: bookingData.time,
              treatments: treatmentNames,
              totalPrice: totalPrice,
              currency: 'EUR',
            }),
          }
        );

        if (!emailResponse.ok) {
          console.error('Failed to send confirmation email:', await emailResponse.text());
        } else {
          console.log('Confirmation email sent successfully');
        }
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
        // Continue even if email fails
      }
    }

    // Trigger push notifications for hairdressers
    try {
      console.log('Triggering push notifications for booking:', booking.id);
      const pushResponse = await supabase.functions.invoke('trigger-new-booking-notifications', {
        body: { bookingId: booking.id }
      });

      if (pushResponse.error) {
        console.error('Failed to trigger push notifications:', pushResponse.error);
      } else {
        console.log('Push notifications triggered:', pushResponse.data);
      }
    } catch (pushError) {
      console.error('Error triggering push notifications:', pushError);
      // Continue even if push notifications fail
    }

    // Trigger email notification to admins
    try {
      console.log('Sending admin email notification for booking:', booking.id);
      const adminEmailResponse = await supabase.functions.invoke('notify-admin-new-booking', {
        body: { bookingId: booking.id }
      });

      if (adminEmailResponse.error) {
        console.error('Failed to send admin email notification:', adminEmailResponse.error);
      } else {
        console.log('Admin email notification sent:', adminEmailResponse.data);
      }
    } catch (adminEmailError) {
      console.error('Error sending admin email notification:', adminEmailError);
      // Continue even if admin email fails
    }

    // If payment method is room, notify concierge to charge the room
    if (paymentMethod === 'room') {
      try {
        console.log('Sending concierge room payment notification for booking:', booking.id);
        const conciergeEmailResponse = await supabase.functions.invoke('notify-concierge-room-payment', {
          body: { bookingId: booking.id }
        });

        if (conciergeEmailResponse.error) {
          console.error('Failed to send concierge room payment notification:', conciergeEmailResponse.error);
        } else {
          console.log('Concierge room payment notification sent:', conciergeEmailResponse.data);
        }
      } catch (conciergeEmailError) {
        console.error('Error sending concierge room payment notification:', conciergeEmailError);
        // Continue even if concierge email fails
      }
    }

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
        error: 'An unexpected error occurred'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
