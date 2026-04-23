import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";

const BOOKING_CONFIRMED_TEMPLATE_ID = "e2a8e114-bdfa-46bb-9868-8681a416f016";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { bookingId } = await req.json();
    console.log('[notify-booking-confirmed] Processing booking:', bookingId);

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[notify-booking-confirmed] Booking not found:', bookingError);
      throw new Error('Booking not found');
    }

    console.log('[notify-booking-confirmed] Booking found:', booking.booking_id);

    const { data: bookingTreatments } = await supabase
      .from('booking_treatments')
      .select('treatment_id, treatment_menus(name, price)')
      .eq('booking_id', bookingId);

    const treatments = bookingTreatments?.map(bt => {
      const menu = bt.treatment_menus as any;
      return { name: menu?.name || 'Unknown', price: menu?.price || 0 };
    }) || [];

    const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const formattedTime = booking.booking_time?.substring(0, 5) || '';

    const siteUrl = Deno.env.get('SITE_URL') || `https://${brand.appDomain}`;
    const bookingDetailsUrl = `${siteUrl}/admin/booking?bookingId=${bookingId}`;

    const treatmentName = treatments.map(t => t.name).join(', ');
    const treatmentPrice = treatments.reduce((sum, t) => sum + (Number(t.price) || 0), 0);

    const templateVariables: Record<string, string> = {
      booking_number: String(booking.booking_id ?? ''),
      booking_date: `${formattedDate} ${formattedTime}`.trim(),
      booking_url: bookingDetailsUrl,
      client_name: `${booking.client_first_name ?? ''} ${booking.client_last_name ?? ''}`.trim(),
      client_phone: booking.phone ?? '',
      hotel_name: booking.hotel_name ?? '',
      room_number: booking.room_number ? String(booking.room_number) : '',
      therapist_name: booking.therapist_name ?? '',
      total_price: `${booking.total_price ?? 0}€`,
      treatment_name: treatmentName,
      treatment_price: `${treatmentPrice}€`,
    };

    const subject = `✅ #${booking.booking_id} confirmée · ${booking.therapist_name ?? ''}`;

    const emailsSent: string[] = [];
    const errors: string[] = [];

    // 1. Send to admins
    const { data: admins } = await supabase
      .from('admins')
      .select('email, first_name, last_name')
      .or('status.eq.active,status.eq.Actif');

    if (admins && admins.length > 0) {
      console.log('[notify-booking-confirmed] Sending to admins:', JSON.stringify(admins, null, 2));
      for (const admin of admins) {
        const { error: emailError } = await sendEmail({
          to: admin.email,
          subject,
          templateId: BOOKING_CONFIRMED_TEMPLATE_ID,
          templateVariables,
        });

        if (emailError) {
          console.error('[notify-booking-confirmed] Error sending to admin:', admin.email, emailError);
          errors.push(`admin:${admin.email}`);
        } else {
          console.log('[notify-booking-confirmed] Email sent to admin:', admin.email);
          emailsSent.push(`admin:${admin.email}`);
        }
        await delay(600);
      }
    }

    await delay(600);

    // 2. Send to concierges
    const { data: conciergeHotels } = await supabase
      .from('concierge_hotels')
      .select('concierge_id')
      .eq('hotel_id', booking.hotel_id);

    if (conciergeHotels && conciergeHotels.length > 0) {
      const conciergeIds = conciergeHotels.map(ch => ch.concierge_id);

      const { data: concierges } = await supabase
        .from('concierges')
        .select('email, first_name, last_name')
        .in('id', conciergeIds)
        .eq('status', 'Actif');

      if (concierges && concierges.length > 0) {
        for (const concierge of concierges) {
          const { error: emailError } = await sendEmail({
            to: concierge.email,
            subject: `✅ #${booking.booking_id} confirmée · ${booking.hotel_name ?? ''}`,
            templateId: BOOKING_CONFIRMED_TEMPLATE_ID,
            templateVariables,
          });

          if (emailError) {
            errors.push(`concierge:${concierge.email}`);
          } else {
            emailsSent.push(`concierge:${concierge.email}`);
          }
          await delay(600);
        }
      }
    }

    await delay(600);

    // 3. Send to client
    if (booking.client_email) {
      const { error: emailError } = await sendEmail({
        to: booking.client_email,
        subject: `✅ Votre RDV est confirmé · ${formattedDate}`,
        templateId: BOOKING_CONFIRMED_TEMPLATE_ID,
        templateVariables,
      });

      if (emailError) {
        errors.push(`client:${booking.client_email}`);
      } else {
        emailsSent.push(`client:${booking.client_email}`);
      }
    }

    // 4. Send push notification to assigned therapist
    if (booking.therapist_id) {
      const { data: therapist } = await supabase
        .from('therapists')
        .select('user_id, first_name')
        .eq('id', booking.therapist_id)
        .single();

      if (therapist?.user_id) {
        try {
          const { error: pushError } = await supabase.functions.invoke(
            'send-push-notification',
            {
              body: {
                userId: therapist.user_id,
                title: '🎉 Nouvelle réservation confirmée !',
                body: `Réservation #${booking.booking_id} à ${booking.hotel_name} le ${formattedDate} à ${formattedTime}`,
                data: {
                  bookingId: booking.id,
                  url: `/pwa/booking/${booking.id}`,
                },
              },
              headers: {
                Authorization: `Bearer ${supabaseServiceKey}`,
              },
            }
          );

          if (pushError) {
            errors.push(`push:${therapist.first_name}`);
          } else {
            emailsSent.push(`push:${therapist.first_name}`);
          }
        } catch (e) {
          console.error('[notify-booking-confirmed] Push exception:', e);
          errors.push(`push:${therapist.first_name}`);
        }
      }
    }

    // 5. Send push + in-app notifications to admins
    const { data: adminUsers } = await supabase
      .from('admins')
      .select('user_id, first_name')
      .eq('status', 'Actif');

    if (adminUsers && adminUsers.length > 0) {
      for (const admin of adminUsers) {
        if (!admin.user_id) continue;

        try {
          await supabase.from('notifications').insert({
            user_id: admin.user_id,
            booking_id: booking.id,
            type: 'booking_confirmed',
            message: `✅ Réservation #${booking.booking_id} confirmée par ${booking.therapist_name || 'un thérapeute'} · ${formattedDate} à ${formattedTime}`,
          });
        } catch (e) {
          console.error(`[notify-booking-confirmed] Notification insert error for admin ${admin.first_name}:`, e);
        }

        try {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              userId: admin.user_id,
              title: '✅ Réservation confirmée',
              body: `#${booking.booking_id} confirmée par ${booking.therapist_name || 'un thérapeute'} · ${formattedDate} à ${formattedTime}`,
              data: {
                bookingId: booking.id,
                url: `/admin-pwa/booking/${booking.id}`,
              },
            },
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
          });
          emailsSent.push(`admin-push:${admin.first_name}`);
        } catch (e) {
          console.error(`[notify-booking-confirmed] Admin push error for ${admin.first_name}:`, e);
        }
      }
    }

    // 6. Send Slack notification
    try {
      const treatmentNames = treatments.map(t => t.name);

      await supabase.functions.invoke('send-slack-notification', {
        body: {
          type: 'booking_confirmed',
          bookingId: booking.id,
          bookingNumber: booking.booking_id?.toString() || '',
          clientName: `${booking.client_first_name} ${booking.client_last_name}`,
          hotelName: booking.hotel_name || '',
          bookingDate: booking.booking_date,
          bookingTime: booking.booking_time,
          therapistName: booking.therapist_name,
          totalPrice: booking.total_price,
          currency: '€',
          treatments: treatmentNames,
        },
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      });
      emailsSent.push('slack');
    } catch (slackError) {
      console.error('[notify-booking-confirmed] Slack error:', slackError);
    }

    console.log('[notify-booking-confirmed] Summary - Sent:', emailsSent.length, 'Errors:', errors.length);

    return new Response(
      JSON.stringify({ success: true, emailsSent: emailsSent.length, emails: emailsSent, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[notify-booking-confirmed] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
