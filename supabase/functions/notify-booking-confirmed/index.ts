import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { brand, transactionalFrom } from "../_shared/brand.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { resolveTreatmentPrice } from "../_shared/treatmentPrice.ts";
import { sendSms } from "../_shared/send-sms.ts";
import { buildConfirmedVars, clientGreeting, type EmailVenue } from "../_shared/booking-email-vars.ts";
import { getBookingConfirmedHtml, getBookingConfirmedAdminHtml } from "../_shared/templates/booking-confirmed.ts";
import { buildBookingIcs } from "../_shared/ics.ts";
import type { EmailAttachment } from "../_shared/send-email.ts";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** UTF-8-safe base64 (btoa alone breaks on accented chars in the .ics). */
function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

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

    // `mode: 'resend'` = renvoi manuel déclenché par un admin depuis la fiche
    // booking. On ne rejoue alors QUE la notification client (email et/ou SMS
    // selon `channels`) : pas de push thérapeute, pas d'email admin/concierge,
    // pas de Slack — l'équipe a déjà été notifiée au passage en `confirmed`.
    const {
      bookingId,
      mode = 'auto',
      channels,
      language: languageOverride,
      clientEmail: emailOverride,
      clientPhone: phoneOverride,
    } = await req.json() as {
      bookingId: string;
      mode?: 'auto' | 'resend';
      channels?: { email?: boolean; sms?: boolean };
      language?: 'fr' | 'en';
      clientEmail?: string;
      clientPhone?: string;
    };
    const isResend = mode === 'resend';
    const wantsEmail = isResend ? channels?.email !== false : true;
    const wantsSms = isResend ? channels?.sms === true : true;
    console.log('[notify-booking-confirmed] Processing booking:', bookingId, { mode });

    const BOOKING_SELECT = `
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
        surcharge_amount,
        is_out_of_hours,
        payment_status,
        short_token,
        customer_id,
        language,
        hotels(organization_id, name, address, postal_code, city, country, timezone, website_url, contact_email, image, currency, cancellation_policy_text_en, cancellation_policy_text_fr, organizations(name))
      `;

    let { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[notify-booking-confirmed] Booking not found:', bookingError);
      throw new Error('Booking not found');
    }

    // Group-mode gating: when the booking belongs to a booking_group_id,
    // suppress per-booking emails and only fire ONE notification for the whole
    // group — once ALL siblings are confirmed. The trigger can come from any
    // sibling (each therapist acceptance fires its own call): whichever call
    // observes the group fully confirmed sends, on behalf of the canonical
    // booking (earliest slot). An audit_log lock on the canonical id keeps two
    // near-simultaneous acceptances from double-sending.
    // `groupSiblings` non-null downstream = group mode (aggregated content).
    let groupSiblings: Array<{ id: string; booking_date: string; booking_time: string }> | null = null;
    if (booking.booking_group_id) {
      const { data: siblings } = await supabase
        .from('bookings')
        .select('id, status, booking_date, booking_time')
        .eq('booking_group_id', booking.booking_group_id)
        .order('booking_date', { ascending: true })
        .order('booking_time', { ascending: true })
        .order('id', { ascending: true });

      const allConfirmed = (siblings ?? []).every((b: any) => b.status === 'confirmed');
      if (!allConfirmed) {
        console.log('[notify-booking-confirmed] Skipping — group not fully confirmed yet');
        return new Response(
          JSON.stringify({ success: true, skipped: 'group_partial' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const canonicalId = siblings![0].id;
      const { data: sentRows } = await supabase
        .from('audit_log')
        .select('id')
        .eq('record_id', canonicalId)
        .eq('change_type', 'action')
        .eq('new_values->>action', 'email_sent')
        .eq('new_values->>email_type', 'booking_confirmed')
        .limit(1);
      // En renvoi manuel, le verrou anti-doublon ne s'applique pas : c'est
      // justement un second envoi, demandé explicitement par un admin.
      if (!isResend && sentRows && sentRows.length > 0) {
        console.log('[notify-booking-confirmed] Skipping — group confirmation already sent');
        return new Response(
          JSON.stringify({ success: true, skipped: 'group_already_sent' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Continue with the canonical booking as the email's anchor, whichever
      // sibling triggered this call.
      if (canonicalId !== booking.id) {
        const { data: canonical, error: canonicalError } = await supabase
          .from('bookings')
          .select(BOOKING_SELECT)
          .eq('id', canonicalId)
          .single();
        if (canonicalError || !canonical) {
          console.error('[notify-booking-confirmed] Canonical group booking not found:', canonicalError);
          throw new Error('Canonical group booking not found');
        }
        booking = canonical;
      }
      groupSiblings = (siblings ?? []).map((s: any) => ({
        id: s.id, booking_date: s.booking_date, booking_time: s.booking_time,
      }));
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

    // Group mode: one email for the whole group → pull the treatments of every
    // sibling and label each line with its slot (date · heure), so the client
    // sees all their appointments. Solo mode: unchanged.
    const groupBookingIds = groupSiblings?.map((s) => s.id) ?? [booking.id];
    const slotById = new Map((groupSiblings ?? []).map((s) => [s.id, s]));
    const slotLabel = (siblingId: string): string => {
      const slot = slotById.get(siblingId);
      if (!slot || !groupSiblings || groupSiblings.length < 2) return '';
      const d = new Date(slot.booking_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      return ` · ${d} ${slot.booking_time?.substring(0, 5) ?? ''}`;
    };

    const { data: bookingTreatments } = await supabase
      .from('booking_treatments')
      .select('booking_id, treatment_id, price_override, treatment_menus(name, price, duration, amenity_id), treatment_variants(label, price, duration)')
      .in('booking_id', groupBookingIds);

    // Preserve slot order (groupBookingIds is sorted by date/time).
    const orderByBooking = new Map(groupBookingIds.map((id, i) => [id, i]));
    const treatmentRows = (bookingTreatments ?? [])
      .sort((a: any, b: any) => (orderByBooking.get(a.booking_id) ?? 0) - (orderByBooking.get(b.booking_id) ?? 0))
      .map(bt => {
        const menu = bt.treatment_menus as any;
        const variant = bt.treatment_variants as any;
        return {
          booking_id: (bt as any).booking_id as string,
          baseName: (menu?.name || 'Unknown') + (variant?.label ? ` · ${variant.label}` : ''),
          price: resolveTreatmentPrice(bt as any),
          duration: Number(variant?.duration ?? menu?.duration) || 0,
          is_amenity: !!menu?.amenity_id,
        };
      });
    const treatments = treatmentRows.map((t) => ({
      name: t.baseName + slotLabel(t.booking_id),
      price: t.price,
      duration: t.duration,
      is_amenity: t.is_amenity,
    }));
    // Per-slot treatments (unlabeled) — used for the .ics so each calendar
    // event carries only its own soins and duration.
    const treatmentsForBooking = (siblingId: string) =>
      treatmentRows
        .filter((t) => t.booking_id === siblingId)
        .map((t) => ({ name: t.baseName, price: t.price, duration: t.duration, is_amenity: t.is_amenity }));

    // Client language drives which confirmation template (FR/EN) is sent to the
    // client. Admin/concierge emails stay in French. The booking-level language
    // (operator's explicit per-booking choice) takes precedence over the
    // customer's stored default.
    let clientLanguage: 'fr' | 'en' = 'fr';
    let customerLanguage: string | null = null;
    let customerCivility: string | null = null;
    if ((booking as any).customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('language, civility')
        .eq('id', (booking as any).customer_id)
        .single();
      customerLanguage = (customer as any)?.language ?? null;
      customerCivility = (customer as any)?.civility ?? null;
    }
    const bookingLanguage = (booking as any).language;
    if (languageOverride === 'en' || languageOverride === 'fr') {
      // Renvoi manuel : l'opérateur peut forcer la langue depuis la modale.
      clientLanguage = languageOverride;
    } else if (bookingLanguage === 'en' || bookingLanguage === 'fr') {
      clientLanguage = bookingLanguage;
    } else if (customerLanguage === 'en') {
      clientLanguage = 'en';
    }
    console.log('[notify-booking-confirmed] language resolution', {
      bookingId: booking.id,
      booking_language: bookingLanguage ?? null,
      customer_id: (booking as any).customer_id ?? null,
      customer_language: customerLanguage,
      resolved: clientLanguage,
    });

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
    const bookingDetailsUrl = `${siteUrl}/admin/bookings/${booking.id}`;
    // Client-facing manage URL (short token link, else the manage route) — the
    // admin detail URL must not leak into the client email. Mirrors the SMS.
    const shortToken = (booking as any).short_token;
    const clientManageUrl = shortToken
      ? `${siteUrl}/m/${shortToken}`
      : `${siteUrl}/booking/manage/${booking.id}`;

    const venue = (booking as any).hotels as (EmailVenue & { name?: string | null; timezone?: string | null }) | null;

    // Build the .ics and attach it to the client email — mail clients
    // (Apple/Google/Outlook) auto-detect it and offer "Add to calendar".
    // Group mode: one .ics per slot so every appointment lands in the calendar.
    const icsSources = groupSiblings && groupSiblings.length > 1
      ? groupSiblings.map((s) => ({ id: s.id, booking_date: s.booking_date, booking_time: s.booking_time }))
      : [{ id: booking.id, booking_date: booking.booking_date, booking_time: booking.booking_time }];
    const clientAttachmentList: EmailAttachment[] = [];
    for (const src of icsSources) {
      const icsResult = buildBookingIcs({
        id: src.id,
        booking_id: booking.booking_id,
        booking_date: src.booking_date,
        booking_time: src.booking_time,
        venue_name: venue?.name || booking.hotel_name,
        timezone: venue?.timezone,
        address: venue?.address,
        postal_code: venue?.postal_code,
        city: venue?.city,
        country: venue?.country,
        treatments: treatmentsForBooking(src.id),
      });
      if (icsResult) {
        const filename = icsSources.length > 1
          ? icsResult.filename.replace(/\.ics$/, `-${src.booking_date}-${(src.booking_time ?? '').substring(0, 5).replace(':', 'h')}.ics`)
          : icsResult.filename;
        clientAttachmentList.push({ filename, content: toBase64Utf8(icsResult.ics), contentType: "text/calendar" });
      }
    }
    const clientAttachments: EmailAttachment[] | undefined =
      clientAttachmentList.length > 0 ? clientAttachmentList : undefined;

    // Group mode: the email's totals cover the whole group, not just the
    // canonical booking. Surcharge rows aggregate the same way.
    let groupTotalPrice = booking.total_price;
    let groupSurchargeAmount = booking.surcharge_amount;
    let groupIsOutOfHours = booking.is_out_of_hours;
    if (groupSiblings && groupSiblings.length > 1) {
      const { data: siblingTotals } = await supabase
        .from('bookings')
        .select('total_price, surcharge_amount, is_out_of_hours')
        .in('id', groupBookingIds);
      if (siblingTotals && siblingTotals.length > 0) {
        groupTotalPrice = siblingTotals.reduce((s: number, b: any) => s + (Number(b.total_price) || 0), 0);
        groupSurchargeAmount = siblingTotals.reduce((s: number, b: any) => s + (Number(b.surcharge_amount) || 0), 0);
        groupIsOutOfHours = siblingTotals.some((b: any) => !!b.is_out_of_hours);
      }
    }

    // Shared email variables (civilité, nom, dates, prix, durée, logo du lieu…)
    // sont construits par le builder centralisé. Les emails admin/concierge
    // restent en français ; l'email client suit la langue résolue du client.
    const emailCtx = {
      booking: {
        booking_id: booking.booking_id,
        client_first_name: booking.client_first_name,
        client_last_name: booking.client_last_name,
        phone: booking.phone,
        room_number: booking.room_number,
        therapist_name: booking.therapist_name,
        total_price: groupTotalPrice,
        surcharge_amount: groupSurchargeAmount,
        is_out_of_hours: groupIsOutOfHours,
        hotel_name: booking.hotel_name,
        booking_date: booking.booking_date,
        booking_time: booking.booking_time,
      },
      venue,
      civility: customerCivility,
      treatments,
      bookingUrl: bookingDetailsUrl,
    };
    const adminVars = buildConfirmedVars({ ...emailCtx, lang: 'fr', variant: 'admin' });
    const clientVars = buildConfirmedVars({ ...emailCtx, lang: clientLanguage, bookingUrl: clientManageUrl, variant: 'client' });

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
          from: transactionalFrom('fr'),
          html: getBookingConfirmedAdminHtml(adminVars),
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
            from: transactionalFrom('fr'),
            html: getBookingConfirmedAdminHtml(adminVars),
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
    // est engagé (paid/charged/charged_to_room/card_saved), facturé par un
    // partenaire (Staycation/ClassPass) ou offert (rien à encaisser, aucun
    // webhook Stripe ne suivra). Un booking confirmé par un thérapeute mais non
    // payé reste muet côté client — l'email de confirmation sera envoyé par
    // stripe-webhook au moment du paiement (Gate status === 'confirmed').
    const PAID_STATUSES = ['paid', 'charged', 'charged_to_room', 'card_saved', 'pending_partner_billing', 'offert'];
    const isPaidEnough = PAID_STATUSES.includes((booking as any).payment_status);

    // 3. Send to client (only once payment is engaged)
    const isGroup = !!groupSiblings && groupSiblings.length > 1;
    let clientEmailOk = false;
    // En renvoi manuel, l'opérateur peut corriger l'adresse depuis la modale
    // (cas typique : première tentative sur une adresse erronée).
    const clientEmailTarget: string = (isResend && emailOverride) || booking.client_email;
    if (clientEmailTarget && isPaidEnough && wantsEmail) {
      const { error: emailError } = await sendEmail({
        to: clientEmailTarget,
        subject: clientLanguage === 'en'
          ? `✅ Your ${isGroup ? 'treatments are' : 'treatment is'} confirmed · ${booking.hotel_name ?? ''}`
          : `✅ ${isGroup ? 'Vos soins sont confirmés' : 'Votre soin est confirmé'} · ${booking.hotel_name ?? ''}`,
        from: transactionalFrom(clientLanguage),
        html: getBookingConfirmedHtml(clientLanguage, clientVars),
        attachments: clientAttachments,
        audit: { bookingId: booking.id, emailType: 'booking_confirmed', metadata: { booking_number: booking.booking_id } },
      });

      if (emailError) {
        errors.push(`client:${clientEmailTarget}`);
      } else {
        emailsSent.push(`client:${clientEmailTarget}`);
        clientEmailOk = true;
      }
    } else {
      console.log('[notify-booking-confirmed] Client confirmation email skipped', {
        hasEmail: !!clientEmailTarget,
        isPaidEnough,
        wantsEmail,
        payment_status: (booking as any).payment_status,
      });
    }

    // 3bis. Send SMS to client when booking transitions to confirmed
    // (therapist accepted). Même garde de paiement que l'email ci-dessus.
    const clientPhone: string = (isResend && phoneOverride)
      || (booking as any).phone
      || (booking as any).client_phone
      || '';
    // En renvoi manuel, le SMS est indépendant de l'email : l'opérateur peut ne
    // cocher que le SMS. En envoi automatique il reste conditionné à l'email.
    let clientSmsOk = false;
    if (clientPhone && isPaidEnough && wantsSms && (isResend || clientEmailOk)) {
      try {
        // Civilité : "Madame Dupont" si renseignée, sinon le prénom.
        const { greetingName: smsGreetingName } = clientGreeting(
          customerCivility,
          booking.client_first_name,
          booking.client_last_name,
          clientLanguage,
        );
        // Group mode: the SMS covers the whole group (first slot + count).
        const groupCount = groupSiblings?.length ?? 1;
        const smsBody = clientLanguage === 'en'
          ? (groupCount > 1
            ? `Hello ${smsGreetingName}, your ${groupCount} treatments at ${booking.hotel_name ?? ''} starting ${formattedDate} at ${formattedTime} are confirmed. Manage: ${clientManageUrl}`
            : `Hello ${smsGreetingName}, your treatment at ${booking.hotel_name ?? ''} on ${formattedDate} at ${formattedTime} is confirmed. Manage: ${clientManageUrl}`)
          : (groupCount > 1
            ? `Bonjour ${smsGreetingName}, vos ${groupCount} soins chez ${booking.hotel_name ?? ''} à partir du ${formattedDate} à ${formattedTime} sont confirmés. Gérer : ${clientManageUrl}`
            : `Bonjour ${smsGreetingName}, votre soin chez ${booking.hotel_name ?? ''} le ${formattedDate} à ${formattedTime} est confirmé. Gérer : ${clientManageUrl}`);
        const smsResult = await sendSms({ to: clientPhone, body: smsBody });
        if (smsResult.error) {
          console.error('[notify-booking-confirmed][sms] Confirmation SMS error:', smsResult.error);
          errors.push(`sms:${clientPhone}`);
        } else {
          console.log('[notify-booking-confirmed][sms] Confirmation SMS sent:', smsResult.sid);
          emailsSent.push(`sms:${clientPhone}`);
          clientSmsOk = true;
        }
      } catch (smsErr) {
        console.error('[notify-booking-confirmed][sms] Confirmation SMS exception:', smsErr);
        errors.push(`sms:${clientPhone}`);
      }
    } else {
      console.log('[notify-booking-confirmed][sms] SMS skipped', {
        hasPhone: !!clientPhone, clientEmailOk, isPaidEnough, wantsSms,
        payment_status: (booking as any).payment_status,
      });
    }

    // Renvoi manuel : on s'arrête ici. Tout ce qui suit (push thérapeutes,
    // emails admin/concierge, notifications bulk, Slack) concerne la première
    // notification et ne doit pas être rejoué.
    if (isResend) {
      const success = (wantsEmail ? clientEmailOk : true) && (wantsSms ? clientSmsOk : true);
      return new Response(
        JSON.stringify({
          success,
          emailSent: clientEmailOk,
          smsSent: clientSmsOk,
          ...(isPaidEnough ? {} : { skipped: 'payment_not_engaged' }),
          ...(errors.length ? { errors } : {}),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Send push notification to all accepted therapists (primary + duo
    // secondary; group mode: every therapist across the group's bookings)
    const { data: acceptedTherapists } = await supabase
      .from('booking_therapists')
      .select('therapist_id')
      .in('booking_id', groupBookingIds)
      .eq('status', 'accepted');

    const therapistIds = [...new Set((acceptedTherapists || []).map(bt => bt.therapist_id))];
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
