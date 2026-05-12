import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { brand, EMAIL_LOGO_URL } from "../_shared/brand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Compact email template - no scrolling
const createAdminEmailHtml = (booking: any, treatments: any[], dashboardUrl: string, groupSlots?: { date: string; time: string; treatmentsLine: string }[]) => {
  const formattedDate = new Date(booking.booking_date).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  const treatmentsHtml = (groupSlots && groupSlots.length > 1)
    ? groupSlots.map(s => {
        const d = new Date(s.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        return `<div style="margin:4px 0;font-size:12px;"><strong>${d} · ${s.time?.substring(0,5)}</strong> — ${s.treatmentsLine}</div>`;
      }).join('')
    : treatments.map(t =>
      `<span style="display:inline-block;background:#f3f4f6;padding:3px 8px;border-radius:4px;margin:2px;font-size:12px;">${t.name} ${t.price}€</span>`
    ).join('');

  const logoUrl = EMAIL_LOGO_URL;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#fff;padding:16px;text-align:center;border-bottom:1px solid #f0f0f0;">
              <img src="${logoUrl}" alt="${brand.name}" style="height:50px;display:block;margin:0 auto 10px;" />
              <span style="display:inline-block;background:#f59e0b;color:#fff;padding:5px 14px;border-radius:14px;font-size:11px;font-weight:600;">🔔 Nouvelle résa</span>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:16px;">
              <!-- Key Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:8px;margin-bottom:12px;">
                <tr>
                  <td style="padding:10px;text-align:center;">
                    <span style="font-size:20px;font-weight:bold;color:#92400e;">#${booking.booking_id}</span>
                    <span style="margin:0 8px;color:#d97706;">·</span>
                    <span style="font-size:14px;color:#92400e;">${formattedDate} à ${booking.booking_time?.substring(0,5)}</span>
                  </td>
                </tr>
              </table>
              
              <!-- Details Grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:12px;">
                <tr>
                  <td style="padding:5px 0;color:#6b7280;width:80px;">Client</td>
                  <td style="padding:5px 0;font-weight:500;">${booking.client_first_name} ${booking.client_last_name}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Tél</td>
                  <td style="padding:5px 0;">${booking.phone}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Hôtel</td>
                  <td style="padding:5px 0;">${booking.hotel_name || booking.hotel_id}${booking.room_number ? ` · Ch.${booking.room_number}` : ''}</td>
                </tr>
              </table>
              
              <!-- Treatments -->
              <div style="margin-bottom:12px;">${treatmentsHtml}</div>
              
              <!-- Total + CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#f9fafb;padding:10px;border-radius:8px;">
                    <span style="font-size:12px;color:#6b7280;">Total</span>
                    <span style="float:right;font-size:18px;font-weight:bold;">${booking.total_price || 0}€</span>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display:inline-block;background:#000;color:#fff;padding:10px 24px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">Gérer →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:10px;text-align:center;background:#fafafa;font-size:11px;color:#9ca3af;">
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
    const dashboardUrl = `${siteUrl}/admin/booking?bookingId=${bookingId}`;

    // Group mode: fetch every sibling booking sharing this group_id.
    let groupBookings: any[] | null = null;
    if (groupId) {
      const { data: siblings } = await supabaseClient
        .from("bookings")
        .select(`*, booking_treatments (treatment_menus (name, price, duration))`)
        .eq("booking_group_id", groupId)
        .order("booking_date", { ascending: true })
        .order("booking_time", { ascending: true });
      if (siblings && siblings.length > 0) groupBookings = siblings;
    }

    const booking = groupBookings ? groupBookings[0] : (await supabaseClient
      .from("bookings")
      .select(`*, booking_treatments (treatment_menus (name, price, duration))`)
      .eq("id", bookingId)
      .single()).data;

    if (!booking) {
      console.error("Booking not found");
      throw new Error("Booking not found");
    }

    const treatments = booking.booking_treatments?.map((bt: any) => ({
      name: bt.treatment_menus?.name || 'Unknown',
      price: bt.treatment_menus?.price || 0,
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

    const { data: admins, error: adminsError } = await supabaseClient
      .from("admins")
      .select("email, first_name, last_name, user_id")
      .eq("status", "Actif");

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
