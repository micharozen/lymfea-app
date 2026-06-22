import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { brand } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { sendSms } from "../_shared/send-sms.ts";

const BOOKING_CONFIRMED_TEMPLATE_ID = "e2a8e114-bdfa-46bb-9868-8681a416f016";
const BOOKING_CONFIRMED_TEMPLATE_ID_EN = "c73fa801-c20f-40ef-834a-4d3eb2d7d96c";

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
      .select(`
        id,
        booking_id,
        booking_group_id,
        booking_date,
        booking_time,
        client_first_name,
        client_last_name,
        client_email,
        phone,
        hotel_id,
        hotel_name,
        room_number,
        therapist_name,
        therapist_id,
        total_price,
        payment_status,
        short_token,
        customer_id,
        hotels(organization_id, address, postal_code, city, country, contact_email, organizations(name))
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[notify-booking-confirmed] Booking not found:', bookingError);
      throw new Error('Booking not found');
    }

    // Group-mode gating: when the booking belongs to a booking_group_id,
    // suppress per-booking emails and only fire once — when ALL siblings are
    // confirmed AND this booking is the canonical first (smallest id-sort).
    // This keeps the client/admin/concierge inboxes from receiving N copies.
    if (booking.booking_group_id) {
      const { data: siblings } = await supabase
        .from('bookings')
        .select('id, status, booking_date, booking_time')
        .eq('booking_group_id', booking.booking_group_id)
        .order('booking_date', { ascending: true })
        .order('booking_time', { ascending: true })
        .order('id', { ascending: true });

      const allConfirmed = (siblings ?? []).every((b: any) => b.status === 'confirmed');
      const canonicalId = siblings?.[0]?.id;
      if (!allConfirmed || canonicalId !== bookingId) {
        console.log('[notify-booking-confirmed] Skipping group sibling — waiting for full group confirmation');
        return new Response(
          JSON.stringify({ success: true, skipped: 'group_partial_or_non_canonical' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('[notify-booking-confirmed] Booking found:', booking.booking_id);

    // Org isolation: resolve the organization that owns this booking's venue so
    // we only notify admins of that org (super-admins keep receiving everything).
    // Mirrors notify-admin-new-booking to avoid cross-tenant leaks.
    const organizationId = (booking as any).hotels?.organization_id ?? null;
    if (!organizationId) {
      console.warn(`[notify-booking-confirmed] No organization_id for hotel ${booking.hotel_id}; notifying super-admins only`);
    }
    const applyAdminOrgFilter = (query: any) =>
      organizationId
        ? query.or(`is_super_admin.eq.true,organization_id.eq.${organizationId}`)
        : query.eq('is_super_admin', true);

    const { data: bookingTreatments } = await supabase
      .from('booking_treatments')
      .select('treatment_id, treatment_menus(name, price)')
      .eq('booking_id', bookingId);

    const treatments = bookingTreatments?.map(bt => {
      const menu = bt.treatment_menus as any;
      return { name: menu?.name || 'Unknown', price: menu?.price || 0 };
    }) || [];

    // Client language drives which confirmation template (FR/EN) is sent to the
    // client. Admin/concierge emails stay in French.
    let clientLanguage: 'fr' | 'en' = 'fr';
    if ((booking as any).customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('language')
        .eq('id', (booking as any).customer_id)
        .single();
      if ((customer as any)?.language === 'en') clientLanguage = 'en';
    }

    const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const clientFormattedDate = new Date(booking.booking_date).toLocaleDateString(
      clientLanguage === 'en' ? 'en-US' : 'fr-FR',
      { weekday: 'short', day: 'numeric', month: 'short' },
    );
    const formattedTime = booking.booking_time?.substring(0, 5) || '';

    const siteUrl = Deno.env.get('SITE_URL') || `https://${brand.appDomain}`;
    const bookingDetailsUrl = `${siteUrl}/admin/bookings/${bookingId}`;

    const treatmentName = treatments.map(t => t.name).join(', ');
    const treatmentPrice = treatments.reduce((sum, t) => sum + (Number(t.price) || 0), 0);

    const venue = (booking as any).hotels;
    const venueAddress = [venue?.address, venue?.postal_code, venue?.city, venue?.country]
      .filter(Boolean)
      .join(', ');

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
      contact_email: venue?.contact_email ?? '',
      venue_address: venueAddress,
      organization_name: venue?.organizations?.name ?? '',
    };

    const subject = `✅ #${booking.booking_id} confirmée · ${booking.therapist_name ?? ''}`;

    const emailsSent: string[] = [];
    const errors: string[] = [];

    // Gate emails behind a secret so staging environments don't spam mailboxes.
    const adminEmailsEnabled = Deno.env.get("ADMIN_EMAIL_NOTIFICATIONS_ENABLED") === "true";

    // 1. Send to admins (org-scoped: super-admins + admins of the booking's org)
    const { data: admins } = await applyAdminOrgFilter(
      supabase
        .from('admins')
        .select('email, first_name, last_name')
        .or('status.eq.active,status.eq.Actif')
    );

    if (!adminEmailsEnabled) {
      console.log("[notify-booking-confirmed] Admin emails disabled (ADMIN_EMAIL_NOTIFICATIONS_ENABLED !== 'true'); skipping admin emails.");
    } else if (admins && admins.length > 0) {
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

    // Garde paiement : on ne notifie le client (email + SMS) que si le paiement
    // est engagé (paid/charged/charged_to_room/card_saved) ou facturé par un
    // partenaire (Staycation/ClassPass). Un booking confirmé par un thérapeute
    // mais non payé reste muet côté client — l'email de confirmation sera envoyé
    // par stripe-webhook au moment du paiement (Gate status === 'confirmed').
    const PAID_STATUSES = ['paid', 'charged', 'charged_to_room', 'card_saved', 'pending_partner_billing'];
    const isPaidEnough = PAID_STATUSES.includes((booking as any).payment_status);

    // 3. Send to client (only once payment is engaged)
    let clientEmailOk = false;
    if (booking.client_email && isPaidEnough) {
      const { error: emailError } = await sendEmail({
        to: booking.client_email,
        subject: clientLanguage === 'en'
          ? `✅ Your appointment is confirmed · ${clientFormattedDate}`
          : `✅ Votre RDV est confirmé · ${clientFormattedDate}`,
        templateId: clientLanguage === 'en'
          ? BOOKING_CONFIRMED_TEMPLATE_ID_EN
          : BOOKING_CONFIRMED_TEMPLATE_ID,
        templateVariables: {
          ...templateVariables,
          booking_date: `${clientFormattedDate} ${formattedTime}`.trim(),
        },
      });

      if (emailError) {
        errors.push(`client:${booking.client_email}`);
      } else {
        emailsSent.push(`client:${booking.client_email}`);
        clientEmailOk = true;
      }
    } else {
      console.log('[notify-booking-confirmed] Client confirmation email skipped', {
        hasEmail: !!booking.client_email,
        isPaidEnough,
        payment_status: (booking as any).payment_status,
      });
    }

    // 3bis. Send SMS to client when booking transitions to confirmed
    // (therapist accepted). Même garde de paiement que l'email ci-dessus.
    const clientPhone: string = (booking as any).phone ?? (booking as any).client_phone ?? '';
    if (clientPhone && clientEmailOk && isPaidEnough) {
      try {
        const firstName = booking.client_first_name ?? '';
        const shortToken = (booking as any).short_token;
        const clientManageUrl = shortToken
          ? `${siteUrl}/m/${shortToken}`
          : `${siteUrl}/booking/manage/${bookingId}`;
        const smsBody = `Bonjour ${firstName}, votre soin chez ${booking.hotel_name ?? ''} le ${formattedDate} à ${formattedTime} est confirmé. Gérer : ${clientManageUrl}`;
        const smsResult = await sendSms({ to: clientPhone, body: smsBody });
        if (smsResult.error) {
          console.error('[notify-booking-confirmed][sms] Confirmation SMS error:', smsResult.error);
          errors.push(`sms:${clientPhone}`);
        } else {
          console.log('[notify-booking-confirmed][sms] Confirmation SMS sent:', smsResult.sid);
          emailsSent.push(`sms:${clientPhone}`);
        }
      } catch (smsErr) {
        console.error('[notify-booking-confirmed][sms] Confirmation SMS exception:', smsErr);
        errors.push(`sms:${clientPhone}`);
      }
    } else {
      console.log('[notify-booking-confirmed][sms] SMS skipped', {
        hasPhone: !!clientPhone, clientEmailOk, isPaidEnough,
        payment_status: (booking as any).payment_status,
      });
    }

    // 4. Send push notification to all accepted therapists (primary + duo secondary)
    const { data: acceptedTherapists } = await supabase
      .from('booking_therapists')
      .select('therapist_id')
      .eq('booking_id', bookingId)
      .eq('status', 'accepted');

    const therapistIds = (acceptedTherapists || []).map(bt => bt.therapist_id);
    // Fallback to primary therapist_id if bridge table is empty (solo booking pre-migration)
    if (therapistIds.length === 0 && booking.therapist_id) {
      therapistIds.push(booking.therapist_id);
    }

    if (therapistIds.length > 0) {
      const { data: therapistUsers } = await supabase
        .from('therapists')
        .select('user_id, first_name')
        .in('id', therapistIds);

      await Promise.all(
        (therapistUsers || [])
          .filter((t: any) => t.user_id)
          .map(async (therapist: any) => {
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
          })
      );
    }

    // 5. Send push + in-app notifications to admins (org-scoped, same filter as emails)
    const { data: adminUsers } = await applyAdminOrgFilter(
      supabase
        .from('admins')
        .select('user_id, first_name')
        .or('status.eq.active,status.eq.Actif')
    );

    if (adminUsers && adminUsers.length > 0) {
      const adminsWithUserId = adminUsers.filter((a: any) => a.user_id);

      // Bulk insert all in-app notifications in one query
      if (adminsWithUserId.length > 0) {
        try {
          await supabase.from('notifications').insert(
            adminsWithUserId.map((admin: any) => ({
              user_id: admin.user_id,
              booking_id: booking.id,
              type: 'booking_confirmed',
              message: `✅ Réservation #${booking.booking_id} confirmée par ${booking.therapist_name || 'un thérapeute'} · ${formattedDate} à ${formattedTime}`,
            }))
          );
        } catch (e) {
          console.error('[notify-booking-confirmed] Bulk notification insert error:', e);
        }
      }

      // Send push notifications in parallel
      await Promise.all(
        adminsWithUserId.map(async (admin: any) => {
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
        })
      );
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
