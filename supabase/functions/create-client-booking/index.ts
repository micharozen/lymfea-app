import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { isInBlockedSlot } from '../_shared/blocked-slots.ts';

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
  paymentMethod: z.enum(['room', 'card', 'cash', 'offert']).optional().default('room'),
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
      pmsGuestCheckIn: clientData.pmsGuestCheckIn || null,
      pmsGuestCheckOut: clientData.pmsGuestCheckOut || null,
    };

    // Get hotel info
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('name, venue_type, auto_validate_bookings, currency, offert, company_offered, pms_type, pms_auto_charge_room, opening_time, closing_time, timezone')
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

    // Coworking spaces don't support room payment
    if (paymentMethod === 'room' && hotel.venue_type === 'coworking') {
      console.error('Room payment not available for coworking');
      return new Response(
        JSON.stringify({ success: false, error: 'Room payment is not available for coworking spaces' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Validate that all treatment IDs exist and check for price_on_request, duration, lead_time
    const treatmentIds = treatments.map(t => t.treatmentId);
    const { data: validTreatments, error: treatmentValidationError } = await supabase
      .from('treatment_menus')
      .select('id, price_on_request, duration, lead_time')
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

    // Calculate total duration from treatments (considering quantities)
    let totalDuration = 0;
    for (const treatment of treatments) {
      const treatmentData = validTreatments?.find(t => t.id === treatment.treatmentId);
      if (treatmentData?.duration) {
        totalDuration += treatmentData.duration * treatment.quantity;
      }
    }
    console.log('Total booking duration:', totalDuration, 'minutes');

    // TOCTOU: Check blocked slots server-side
    if (await isInBlockedSlot(supabase, hotelId, bookingData.date, bookingData.time, totalDuration || 30)) {
      console.log('Rejected: overlaps with blocked slot', bookingData.time);
      return new Response(
        JSON.stringify({ success: false, error: 'BLOCKED_SLOT' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // TOCTOU: Check lead time server-side (for today's bookings only)
    const maxLeadTime = Math.max(...(validTreatments?.map(t => t.lead_time || 0) || [0]));
    if (maxLeadTime > 0) {
      const now = new Date();
      const bookingDateStr = bookingData.date;
      const todayStr = now.toISOString().split('T')[0];

      if (bookingDateStr === todayStr) {
        const bookingMinutes = parseInt(bookingData.time.split(':')[0]) * 60 + parseInt(bookingData.time.split(':')[1]);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const minutesUntilBooking = bookingMinutes - nowMinutes;

        if (minutesUntilBooking < maxLeadTime) {
          console.log('Rejected: lead time violation', { minutesUntilBooking, maxLeadTime });
          return new Response(
            JSON.stringify({ success: false, error: 'LEAD_TIME_VIOLATION' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
      }
    }

    // Check if any treatment is price_on_request
    const hasPriceOnRequest = validTreatments?.some(t => t.price_on_request) || false;
    const isOffert = !!hotel.offert || !!hotel.company_offered;
    const bookingStatus = (!isOffert && hasPriceOnRequest) ? 'quote_pending' : 'pending';
    const effectiveTotalPrice = isOffert ? 0 : (hasPriceOnRequest ? 0 : totalPrice);
    const effectivePaymentMethod = isOffert ? 'offert' : paymentMethod;
    const effectivePaymentStatus = isOffert ? 'offert' : (paymentMethod === 'room' ? 'charged_to_room' : 'pending');
    console.log('Booking status:', bookingStatus, '| Has price on request:', hasPriceOnRequest, '| Is offert:', isOffert);

    // Find or create customer by phone
    const { data: customerId, error: customerError } = await supabase.rpc('find_or_create_customer', {
      _phone: sanitizedClientData.phone,
      _first_name: sanitizedClientData.firstName,
      _last_name: sanitizedClientData.lastName,
      _email: sanitizedClientData.email,
    });

    if (customerError) {
      console.error('Error finding/creating customer:', customerError);
      // Non-blocking: continue booking creation without customer link
    } else {
      console.log('Customer linked:', customerId);
    }

    // TOCTOU FIX: Atomically reserve treatment room + create booking via RPC with FOR UPDATE lock
    const { data: bookingId, error: rpcError } = await supabase.rpc('reserve_trunk_atomically', {
      _hotel_id: hotelId,
      _booking_date: bookingData.date,
      _booking_time: bookingData.time,
      _duration: totalDuration > 0 ? totalDuration : null,
      _hotel_name: hotel.name,
      _client_first_name: sanitizedClientData.firstName,
      _client_last_name: sanitizedClientData.lastName,
      _client_email: sanitizedClientData.email,
      _phone: sanitizedClientData.phone,
      _room_number: sanitizedClientData.roomNumber,
      _client_note: sanitizedClientData.note,
      _status: bookingStatus,
      _payment_method: effectivePaymentMethod,
      _payment_status: effectivePaymentStatus,
      _total_price: effectiveTotalPrice,
      _language: 'fr',
      _treatment_ids: treatmentIds,
      _customer_id: customerId || null,
    });

    if (rpcError) {
      if (rpcError.message?.includes('NO_TRUNK_AVAILABLE')) {
        console.log('Slot taken (atomic check)');
        return new Response(
          JSON.stringify({ success: false, error: 'SLOT_TAKEN' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
        );
      }
      console.error('RPC error:', rpcError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create booking' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('Booking created atomically:', bookingId);

    // Fetch the created booking to get booking_id (sequence number)
    const { data: booking, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('id, booking_id')
      .eq('id', bookingId)
      .single();

    if (bookingFetchError || !booking) {
      console.error('Failed to fetch created booking:', bookingFetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Booking created but failed to retrieve details' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Create booking treatments
    const treatmentInserts = [];
    for (const treatment of treatments) {
      for (let i = 0; i < treatment.quantity; i++) {
        treatmentInserts.push({
          booking_id: bookingId,
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

    // Auto-validation logic: if hotel has auto_validate_bookings enabled and booking is pending (not quote_pending)
    let wasAutoValidated = false;
    let autoAssignedTherapist: { id: string; first_name: string; last_name: string } | null = null;

    if (hotel.auto_validate_bookings && bookingStatus === 'pending') {
      console.log('Auto-validation enabled for hotel, checking for single therapist...');

      // Get active therapists assigned to this hotel
      const { data: therapistVenues, error: therapistError } = await supabase
        .from('therapist_venues')
        .select(`
          therapist_id,
          therapists:therapist_id (
            id,
            first_name,
            last_name,
            status
          )
        `)
        .eq('hotel_id', hotelId);

      if (!therapistError && therapistVenues) {
        // Filter to get only active therapists
        const activeTherapists = therapistVenues
          .filter((tv: any) => {
            const t = tv.therapists;
            return t && (t.status?.toLowerCase() === 'active' || t.status?.toLowerCase() === 'actif');
          })
          .map((tv: any) => tv.therapists);

        console.log('Active therapists found:', activeTherapists.length);

        // If exactly one active therapist, auto-assign and confirm
        if (activeTherapists.length === 1) {
          const therapist = activeTherapists[0];
          const therapistName = `${therapist.first_name} ${therapist.last_name}`;

          console.log('Auto-assigning therapist:', therapistName);

          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              status: 'confirmed',
              therapist_id: therapist.id,
              therapist_name: therapistName,
              assigned_at: new Date().toISOString(),
            })
            .eq('id', bookingId);

          if (!updateError) {
            wasAutoValidated = true;
            autoAssignedTherapist = therapist;
            console.log('Booking auto-validated and assigned to:', therapistName);
          } else {
            console.error('Failed to auto-validate booking:', updateError);
          }
        } else {
          console.log('Auto-validation skipped: found', activeTherapists.length, 'active therapists (need exactly 1)');
        }
      } else {
        console.error('Error fetching therapists for auto-validation:', therapistError);
      }
    }

    // Get treatment names, prices and price_on_request status for email
    const { data: treatmentDetails } = await supabase
      .from('treatment_menus')
      .select('id, name, price, price_on_request')
      .in('id', treatmentIds);

    // Format treatments with proper structure for email
    const treatmentsForEmail = treatmentDetails?.map(t => ({
      name: t.name,
      price: t.price,
      isPriceOnRequest: t.price_on_request || false,
    })) || [];

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
              bookingId: bookingId,
              bookingNumber: booking.booking_id.toString(),
              clientName: `${sanitizedClientData.firstName} ${sanitizedClientData.lastName}`,
              hotelName: hotel.name,
              roomNumber: sanitizedClientData.roomNumber,
              bookingDate: bookingData.date,
              bookingTime: bookingData.time,
              treatments: treatmentsForEmail,
              totalPrice: hasPriceOnRequest ? totalPrice : totalPrice,
              currency: hotel.currency || 'EUR',
              isQuotePending: hasPriceOnRequest,
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

    // For quote_pending bookings, only notify admin (not therapists)
    if (bookingStatus === 'quote_pending') {
      try {
        console.log('Sending quote pending notification to admin for booking:', bookingId);
        const quoteNotifResponse = await supabase.functions.invoke('notify-admin-quote-pending', {
          body: { bookingId: bookingId }
        });

        if (quoteNotifResponse.error) {
          console.error('Failed to send quote pending notification:', quoteNotifResponse.error);
        } else {
          console.log('Quote pending notification sent:', quoteNotifResponse.data);
        }
      } catch (quoteNotifError) {
        console.error('Error sending quote pending notification:', quoteNotifError);
      }
    } else if (wasAutoValidated) {
      // Auto-validated booking: send confirmation notifications (not new booking notifications)
      try {
        console.log('Sending booking confirmed notifications for auto-validated booking:', bookingId);
        const confirmResponse = await supabase.functions.invoke('notify-booking-confirmed', {
          body: { bookingId: bookingId }
        });

        if (confirmResponse.error) {
          console.error('Failed to send booking confirmed notifications:', confirmResponse.error);
        } else {
          console.log('Booking confirmed notifications sent:', confirmResponse.data);
        }
      } catch (confirmError) {
        console.error('Error sending booking confirmed notifications:', confirmError);
      }
    } else {
      // Regular pending booking: smart dispatch to top-ranked therapists
      try {
        console.log('Dispatching booking to ranked therapists:', bookingId);
        const dispatchResponse = await supabase.functions.invoke('dispatch-booking-therapist', {
          body: { bookingId: bookingId }
        });

        if (dispatchResponse.error) {
          console.error('Failed to dispatch booking:', dispatchResponse.error);
        } else {
          console.log('Smart dispatch result:', dispatchResponse.data);
        }
      } catch (dispatchError) {
        console.error('Error dispatching booking:', dispatchError);
        // Continue even if dispatch fails
      }

      // Trigger email notification to admins
      try {
        console.log('Sending admin email notification for booking:', bookingId);
        const adminEmailResponse = await supabase.functions.invoke('notify-admin-new-booking', {
          body: { bookingId: bookingId }
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
    }

    // If payment method is room, notify concierge to charge the room
    if (paymentMethod === 'room') {
      try {
        console.log('Sending concierge room payment notification for booking:', bookingId);
        const conciergeEmailResponse = await supabase.functions.invoke('notify-concierge-room-payment', {
          body: { bookingId: bookingId }
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

      // Attempt PMS auto-charge (non-blocking, concierge already notified as fallback)
      if (hotel.pms_auto_charge_room && hotel.pms_type) {
        try {
          console.log('Attempting PMS auto-charge for booking:', bookingId, 'pms_type:', hotel.pms_type);
          const pmsResponse = await supabase.functions.invoke('pms-post-charge', {
            body: { bookingId: bookingId }
          });

          if (pmsResponse.error || pmsResponse.data?.fallbackToManual) {
            console.log('PMS auto-charge failed, manual process required:', pmsResponse.error || pmsResponse.data?.error);
          } else {
            console.log('PMS charge posted successfully:', pmsResponse.data?.chargeId);
          }
        } catch (pmsError) {
          console.error('Error during PMS auto-charge:', pmsError);
          // Silent fail — concierge notification already sent
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        bookingId: bookingId,
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
