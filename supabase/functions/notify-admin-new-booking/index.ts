import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand, EMAIL_LOGO_URL } from "../_shared/brand.ts";
import { resolveTreatmentPrice } from "../_shared/treatmentPrice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Type de client → label FR pour le badge admin.
const CLIENT_TYPE_LABELS: Record<string, string> = {
  hotel: 'Client hôtel',
  external: 'Client externe',
  staycation: 'Staycation',
  classpass: 'ClassPass',
  sezame: 'Sezame',
};

// Origine de la réservation (colonne bookings.source, enum contraint) → label FR.
const SOURCE_LABELS: Record<string, string> = {
  admin: 'Créée par l’équipe',
  client: 'Réservation en ligne',
  email: 'Email',
  pwa: 'App thérapeute',
  api: 'API',
  phone: 'Téléphone',
};

// Statut de paiement → label FR. Aligné sur PAID_STATUSES utilisé dans
// notify-booking-confirmed et trigger-new-booking-notifications.
const paymentStatusLabel = (status?: string | null): string => {
  const s = (status || '').toLowerCase();
  if (['paid', 'charged', 'charged_to_room', 'card_saved', 'offert'].includes(s)) return 'Payé';
  if (s === 'pending_partner_billing') return 'Paiement partenaire';
  return 'En attente';
};

// Ligne label/valeur en style éditorial (label uppercase gris + valeur).
const infoRow = (label: string, valueHtml: string) => `
<tr>
  <td style="padding:14px 0;border-bottom:1px solid #f0eee9;">
    <span style="display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9b958c;">${label}</span>
  </td>
  <td style="padding:14px 0;border-bottom:1px solid #f0eee9;text-align:right;">
    <span style="font-size:15px;color:#1a1a1a;">${valueHtml}</span>
  </td>
</tr>
`;

// Email template — style éditorial, adapté à un public admin.
const createAdminEmailHtml = (booking: any, treatments: any[], dashboardUrl: string, groupSlots?: { date: string; time: string; treatmentsLine: string }[]) => {
  const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  const treatmentsHtml = (groupSlots && groupSlots.length > 1)
    ? groupSlots.map(s => {
        const d = new Date(s.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        return `<div style="margin:6px 0;font-size:14px;color:#1a1a1a;"><strong>${d} · ${s.time?.substring(0,5)}</strong> — ${s.treatmentsLine}</div>`;
      }).join('')
    : treatments.map(t =>
      `<div style="margin:6px 0;font-size:14px;color:#1a1a1a;">${t.name} · <strong>${t.price}€</strong></div>`
    ).join('');

  const logoUrl = EMAIL_LOGO_URL;

  const clientTypeLabel = CLIENT_TYPE_LABELS[booking.client_type] || 'Client';
  const typeValue = (booking.client_type === 'hotel' && booking.room_number)
    ? `${clientTypeLabel} · Ch.${booking.room_number}`
    : clientTypeLabel;

  const sourceLabel = SOURCE_LABELS[booking.source];

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f4ef;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ef;padding:32px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fff;border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 0;text-align:center;">
              <img src="${logoUrl}" alt="${brand.name}" style="height:40px;display:block;margin:0 auto 16px;" />
              <span style="display:inline-block;background:#fef3c7;color:#92400e;padding:5px 14px;border-radius:14px;font-size:11px;font-weight:600;">🔔 Nouvelle réservation</span>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding:24px 32px 8px;text-align:center;">
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;color:#1a1a1a;">Nouvelle réservation</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:16px 32px 32px;">
              <!-- Number + date -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f5ed;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <span style="font-size:22px;font-weight:bold;color:#2f4a2a;">#${booking.booking_id}</span>
                    <span style="float:right;font-size:14px;color:#4a6342;line-height:30px;">${formattedDate} à ${booking.booking_time?.substring(0,5)}</span>
                  </td>
                </tr>
              </table>

              <!-- Details -->
              <table width="100%" cellpadding="0" cellspacing="0">
                ${infoRow('Client', `${booking.client_first_name} ${booking.client_last_name}`)}
                ${infoRow('Type', typeValue)}
                ${booking.phone ? infoRow('Téléphone', booking.phone) : ''}
                ${booking.client_email ? infoRow('Email', booking.client_email) : ''}
                ${infoRow('Hôtel', booking.hotel_name || booking.hotel_id)}
                ${infoRow('Paiement', paymentStatusLabel(booking.payment_status))}
                ${sourceLabel ? infoRow('Source', sourceLabel) : ''}
              </table>

              <!-- Treatments -->
              <div style="margin:24px 0 16px;">${treatmentsHtml}</div>

              <!-- Total -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f2;border-radius:12px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#9b958c;">Total</span>
                    <span style="float:right;font-size:22px;font-weight:bold;color:#1a1a1a;">${booking.total_price || 0}€</span>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:14px 36px;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:1px;text-decoration:none;">GÉRER →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px;text-align:center;background:#faf9f5;font-size:11px;color:#9b958c;">
              ${brand.name}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { bookingId, groupId } = await req.json();

    if (!bookingId) {
      throw new Error("Booking ID is required");
    }

    console.log("Sending admin notification for booking:", bookingId, groupId ? `(group ${groupId})` : '');

    const siteUrl = Deno.env.get("SITE_URL") || `https://${brand.appDomain}`;
    const dashboardUrl = `${siteUrl}/admin/bookings/${bookingId}`;

    // Group mode: fetch every sibling booking sharing this group_id.
    let groupBookings: any[] | null = null;
    if (groupId) {
      const { data: siblings } = await supabaseClient
        .from("bookings")
        .select(`
        id,
        booking_id,
        booking_group_id,
        booking_date,
        booking_time,
        client_first_name,
        client_last_name,
        client_email,
        client_type,
        phone,
        hotel_id,
        hotel_name,
        room_number,
        total_price,
        payment_status,
        source,
        booking_treatments (price_override, treatment_menus (name, price, duration), treatment_variants (price))
      `)
        .eq("booking_group_id", groupId)
        .order("booking_date", { ascending: true })
        .order("booking_time", { ascending: true });
      if (siblings && siblings.length > 0) groupBookings = siblings;
    }

    const booking = groupBookings ? groupBookings[0] : (await supabaseClient
      .from("bookings")
      .select(`
        id,
        booking_id,
        booking_group_id,
        booking_date,
        booking_time,
        client_first_name,
        client_last_name,
        client_email,
        client_type,
        phone,
        hotel_id,
        hotel_name,
        room_number,
        total_price,
        payment_status,
        source,
        booking_treatments (price_override, treatment_menus (name, price, duration), treatment_variants (price))
      `)
      .eq("id", bookingId)
      .single()).data;

    if (!booking) {
      console.error("Booking not found");
      throw new Error("Booking not found");
    }

    const treatments = booking.booking_treatments?.map((bt: any) => ({
      name: bt.treatment_menus?.name || 'Unknown',
      price: resolveTreatmentPrice(bt),
      duration: bt.treatment_menus?.duration || 0
    })) || [];

    const groupSlots = groupBookings && groupBookings.length > 1
      ? groupBookings.map(b => ({
          date: b.booking_date,
          time: b.booking_time,
          treatmentsLine: (b.booking_treatments ?? [])
            .map((bt: any) => bt.treatment_menus?.name || 'Soin').join(', '),
        }))
      : undefined;
    const groupTotal = groupBookings && groupBookings.length > 1
      ? groupBookings.reduce((acc, b) => acc + (b.total_price || 0), 0)
      : null;
    if (groupTotal !== null) booking.total_price = groupTotal;

    // Resolve the organization that owns this booking's venue so we only notify
    // admins of that org. Super-admins (Lymfea staff) are authorized cross-org
    // and keep receiving every booking. Without this, org-admins were notified
    // of bookings belonging to other tenants (cross-tenant leak).
    const { data: hotelRow, error: hotelError } = await supabaseClient
      .from("hotels")
      .select("organization_id")
      .eq("id", booking.hotel_id)
      .single();
    if (hotelError) {
      console.error("Error resolving hotel organization:", hotelError);
    }
    const organizationId = hotelRow?.organization_id ?? null;
    if (!organizationId) {
      console.warn(`No organization_id for hotel ${booking.hotel_id}; notifying super-admins only`);
    }

    let adminsQuery = supabaseClient
      .from("admins")
      .select("email, first_name, last_name, user_id")
      .or("status.eq.active,status.eq.Actif");
    // Org isolation: super-admins see everything; org-admins only their org.
    adminsQuery = organizationId
      ? adminsQuery.or(`is_super_admin.eq.true,organization_id.eq.${organizationId}`)
      : adminsQuery.eq("is_super_admin", true);
    const { data: admins, error: adminsError } = await adminsQuery;

      console.log("adminsError", adminsError);
      console.log("admins", admins);
    if (adminsError) {
      console.error("Error fetching admins:", adminsError);
      throw adminsError;
    }

    if (!admins || admins.length === 0) {
      console.log("No active admins found");
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailHtml = createAdminEmailHtml(booking, treatments, dashboardUrl, groupSlots);
    const subjectPrefix = groupSlots && groupSlots.length > 1
      ? `🔔 Réservation groupée (${groupSlots.length} soins) · `
      : `🔔 #${booking.booking_id} · `;

    let emailsSent = 0;
    const errors: string[] = [];

    // Gate emails behind a secret so staging environments don't spam mailboxes.
    const emailsEnabled = Deno.env.get("ADMIN_EMAIL_NOTIFICATIONS_ENABLED") === "true";

    if (!emailsEnabled) {
      console.log("Admin notification emails are disabled (ADMIN_EMAIL_NOTIFICATIONS_ENABLED !== 'true'); skipping email send.");
    } else {
      for (const admin of admins) {
        try {
          const { error: emailError } = await resend.emails.send({
            from: brand.emails.from.default,
            to: [admin.email],
            subject: `${subjectPrefix}${booking.client_first_name} · ${booking.hotel_name || booking.hotel_id}`,
            html: emailHtml,
          });

          if (emailError) {
            console.error(`Error sending email to ${admin.email}:`, emailError);
            errors.push(`${admin.email}: ${emailError.message}`);
          } else {
            console.log(`✅ Email sent to admin: ${admin.first_name} ${admin.last_name} (${admin.email})`);
            emailsSent++;
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`Error sending email to ${admin.email}:`, err);
          errors.push(`${admin.email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      console.log(`Admin notification emails sent: ${emailsSent}/${admins.length}`);
    }

    // Send push notifications and in-app notifications to admins
    const adminsWithUserId = admins.filter((a: any) => a.user_id);

    // Bulk insert all in-app notifications in one query
    if (adminsWithUserId.length > 0) {
      try {
        await supabaseClient.from("notifications").insert(
          adminsWithUserId.map((admin: any) => ({
            user_id: admin.user_id,
            booking_id: booking.id,
            type: "new_booking",
            message: `🔔 Nouvelle réservation #${booking.booking_id} · ${booking.client_first_name} ${booking.client_last_name} · ${booking.hotel_name || ""}`,
          }))
        );
      } catch (e) {
        console.error("Error bulk inserting admin notifications:", e);
      }
    }

    // Send push notifications in parallel
    const pushResults = await Promise.all(
      adminsWithUserId.map(async (admin: any) => {
        try {
          const { error: pushError } = await supabaseClient.functions.invoke("send-push-notification", {
            body: {
              userId: admin.user_id,
              title: "🔔 Nouvelle réservation",
              body: `#${booking.booking_id} · ${booking.client_first_name} ${booking.client_last_name} · ${booking.hotel_name || ""}`,
              data: {
                bookingId: booking.id,
                url: `/admin-pwa/booking/${booking.id}`,
              },
            },
          });
          if (!pushError) {
            console.log(`✅ Push sent to admin: ${admin.first_name}`);
            return true;
          }
          console.error(`Push error for admin ${admin.first_name}:`, pushError);
          return false;
        } catch (e) {
          console.error(`Push exception for admin ${admin.first_name}:`, e);
          return false;
        }
      })
    );
    const pushSent = pushResults.filter(Boolean).length;

    console.log(`Admin push notifications sent: ${pushSent}/${admins.length}`);

    return new Response(
      JSON.stringify({ success: true, emailsSent, pushSent, totalAdmins: admins.length, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in notify-admin-new-booking:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
