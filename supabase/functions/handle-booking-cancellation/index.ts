import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * COMPREHENSIVE CANCELLATION NOTIFICATION HANDLER
 * Triggered when a booking status changes to 'cancelled'
 * Sends notifications to: Hairdresser, Concierge, and Client
 */
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

    const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);
    const siteUrl = Deno.env.get("SITE_URL") || "https://app.oomworld.com";
    const logoUrl = "https://xbkvmrqanoqdqvqwldio.supabase.co/storage/v1/object/public/assets/oom-logo-email.png";

    const { bookingId, cancellationReason } = await req.json();

    if (!bookingId) {
      throw new Error("Booking ID is required");
    }

    console.log("[handle-booking-cancellation] Processing booking:", bookingId);

    // Get full booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("[handle-booking-cancellation] Booking not found:", bookingError);
      throw new Error("Booking not found");
    }

    const clientName = `${booking.client_first_name} ${booking.client_last_name || ""}`.trim();
    const dateStr = new Date(booking.booking_date).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const timeStr = booking.booking_time?.substring(0, 5) || "";
    const reason = cancellationReason || booking.cancellation_reason || "Non spécifiée";

    const results = {
      hairdresserNotified: false,
      conciergeNotified: false,
      clientNotified: false,
      adminNotified: false,
      errors: [] as string[],
    };

    // ============================================
    // 1. NOTIFY HAIRDRESSER (Push + In-App Notification)
    // ============================================
    if (booking.hairdresser_id) {
      try {
        // Get hairdresser details
        const { data: hairdresser } = await supabaseClient
          .from("hairdressers")
          .select("id, user_id, first_name, last_name")
          .eq("id", booking.hairdresser_id)
          .single();

        if (hairdresser?.user_id) {
          // Create in-app notification
          const notificationMessage = `❌ Le rendez-vous de ${timeStr} à ${booking.hotel_name} a été annulé. Ne vous déplacez pas.`;

          const { error: notifError } = await supabaseClient
            .from("notifications")
            .insert({
              user_id: hairdresser.user_id,
              booking_id: booking.id,
              type: "booking_cancelled",
              message: notificationMessage,
            });

          if (notifError) {
            console.error("[handle-booking-cancellation] Error creating notification:", notifError);
            results.errors.push("Failed to create in-app notification");
          } else {
            console.log("[handle-booking-cancellation] In-app notification created for hairdresser");
          }

          // Send push notification
          try {
            const { error: pushError } = await supabaseClient.functions.invoke(
              "send-push-notification",
              {
                body: {
                  userId: hairdresser.user_id,
                  title: "❌ Réservation Annulée",
                  body: `Le RDV de ${timeStr} à ${booking.hotel_name} a été annulé. Ne vous déplacez pas.`,
                  data: {
                    bookingId: booking.id,
                    type: "booking_cancelled",
                    url: "/pwa/bookings",
                  },
                },
              }
            );

            if (pushError) {
              console.error("[handle-booking-cancellation] Push error:", pushError);
              results.errors.push("Failed to send push notification");
            } else {
              console.log("[handle-booking-cancellation] Push notification sent to hairdresser");
            }
          } catch (pushErr) {
            console.error("[handle-booking-cancellation] Push exception:", pushErr);
          }

          results.hairdresserNotified = true;
        } else {
          console.log("[handle-booking-cancellation] Hairdresser has no user_id");
        }
      } catch (err) {
        console.error("[handle-booking-cancellation] Hairdresser notification error:", err);
        results.errors.push("Hairdresser notification failed");
      }
    } else {
      console.log("[handle-booking-cancellation] No hairdresser assigned");
    }

    // ============================================
    // 2. NOTIFY CONCIERGE (Email)
    // ============================================
    try {
      const { data: conciergeHotels } = await supabaseClient
        .from("concierge_hotels")
        .select("concierge_id")
        .eq("hotel_id", booking.hotel_id);

      if (conciergeHotels && conciergeHotels.length > 0) {
        const conciergeIds = conciergeHotels.map((ch) => ch.concierge_id);

        const { data: concierges } = await supabaseClient
          .from("concierges")
          .select("email, first_name, last_name")
          .in("id", conciergeIds)
          .eq("status", "active");

        if (concierges && concierges.length > 0) {
          const conciergeEmailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#fff;padding:16px;text-align:center;border-bottom:1px solid #f0f0f0;">
              <img src="${logoUrl}" alt="OOM" style="height:50px;display:block;margin:0 auto 10px;" />
              <span style="display:inline-block;background:#ef4444;color:#fff;padding:5px 14px;border-radius:14px;font-size:11px;font-weight:600;">❌ Annulation</span>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;">
              <p style="margin:0 0 16px;font-size:14px;color:#374151;">
                Le soin prévu pour <strong>${clientName}</strong> a été annulé.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:16px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#991b1b;font-weight:600;">
                      📍 Chambre ${booking.room_number || "N/A"}
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;color:#7f1d1d;">
                      <strong>${dateStr} à ${timeStr}</strong>
                    </p>
                    <p style="margin:8px 0 0;font-size:13px;color:#991b1b;">
                      Raison : ${reason}
                    </p>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:16px;">
                <tr>
                  <td style="padding:5px 0;color:#6b7280;width:80px;">Client</td>
                  <td style="padding:5px 0;">${clientName}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Tél</td>
                  <td style="padding:5px 0;">${booking.phone || "-"}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Résa</td>
                  <td style="padding:5px 0;font-weight:500;">#${booking.booking_id}</td>
                </tr>
              </table>
              
              <p style="margin:0;padding:12px;background:#fef2f2;border-radius:6px;font-size:12px;color:#991b1b;text-align:center;">
                Merci de mettre à jour le dossier client si nécessaire.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px;text-align:center;background:#fafafa;font-size:11px;color:#9ca3af;">
              OOM · Notification d'annulation
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

          for (const concierge of concierges) {
            try {
              const { error: emailError } = await resend.emails.send({
                from: "OOM <booking@oomworld.com>",
                to: [concierge.email],
                subject: `❌ Annulation de soin - ${clientName} - Ch.${booking.room_number || "N/A"}`,
                html: conciergeEmailHtml,
              });

              if (emailError) {
                console.error(`[handle-booking-cancellation] Concierge email error:`, emailError);
                results.errors.push(`Failed to email concierge: ${concierge.email}`);
              } else {
                console.log(`[handle-booking-cancellation] Email sent to concierge: ${concierge.email}`);
                results.conciergeNotified = true;
              }
            } catch (e) {
              console.error(`[handle-booking-cancellation] Concierge email exception:`, e);
            }
          }
        }
      }
    } catch (err) {
      console.error("[handle-booking-cancellation] Concierge notification error:", err);
      results.errors.push("Concierge notification failed");
    }

    // ============================================
    // 3. NOTIFY CLIENT (Email)
    // ============================================
    if (booking.client_email) {
      try {
        const clientEmailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#fff;padding:20px 16px;text-align:center;border-bottom:1px solid #f0f0f0;">
              <img src="${logoUrl}" alt="OOM" style="height:60px;display:block;margin:0 auto 12px;" />
              <span style="display:inline-block;background:#6b7280;color:#fff;padding:6px 16px;border-radius:16px;font-size:12px;font-weight:600;">Réservation annulée</span>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 20px;">
              <p style="margin:0 0 16px;font-size:15px;color:#333;">
                Bonjour ${booking.client_first_name},
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#525252;line-height:1.6;">
                Nous vous confirmons que votre réservation a bien été annulée.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;text-transform:uppercase;">Réservation annulée</p>
                    <p style="margin:0 0 4px;font-size:14px;color:#374151;font-weight:600;">#${booking.booking_id}</p>
                    <p style="margin:0;font-size:13px;color:#6b7280;">
                      ${dateStr} à ${timeStr}
                    </p>
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">
                      ${booking.hotel_name}
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin:0 0 20px;font-size:14px;color:#525252;line-height:1.6;">
                Si vous souhaitez prendre un nouveau rendez-vous, n'hésitez pas à nous recontacter ou à scanner le QR code dans votre chambre.
              </p>
              
              <p style="margin:0;font-size:14px;color:#525252;">
                À très bientôt,<br/>
                <strong>L'équipe OOM</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px;text-align:center;background:#fafafa;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">OOM World · Beauty & Wellness</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        const { error: clientEmailError } = await resend.emails.send({
          from: "OOM <booking@oomworld.com>",
          to: [booking.client_email],
          subject: `Confirmation d'annulation de votre rendez-vous OOM`,
          html: clientEmailHtml,
        });

        if (clientEmailError) {
          console.error("[handle-booking-cancellation] Client email error:", clientEmailError);
          results.errors.push("Failed to email client");
        } else {
          console.log("[handle-booking-cancellation] Email sent to client:", booking.client_email);
          results.clientNotified = true;
        }
      } catch (err) {
        console.error("[handle-booking-cancellation] Client email exception:", err);
        results.errors.push("Client email failed");
      }
    } else {
      console.log("[handle-booking-cancellation] No client email available");
    }

    // ============================================
    // 4. NOTIFY ADMINS (Email)
    // ============================================
    try {
      const { data: admins } = await supabaseClient
        .from("admins")
        .select("email, first_name, last_name")
        .eq("status", "active");

      if (admins && admins.length > 0) {
        const adminEmailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#fff;padding:16px;text-align:center;border-bottom:1px solid #f0f0f0;">
              <img src="${logoUrl}" alt="OOM" style="height:50px;display:block;margin:0 auto 10px;" />
              <span style="display:inline-block;background:#ef4444;color:#fff;padding:5px 14px;border-radius:14px;font-size:11px;font-weight:600;">❌ Annulation</span>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;">
              <p style="margin:0 0 16px;font-size:14px;color:#374151;">
                Une réservation a été annulée.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:16px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#991b1b;font-weight:600;">
                      📍 ${booking.hotel_name} - Chambre ${booking.room_number || "N/A"}
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;color:#7f1d1d;">
                      <strong>${dateStr} à ${timeStr}</strong>
                    </p>
                    <p style="margin:8px 0 0;font-size:13px;color:#991b1b;">
                      Raison : ${reason}
                    </p>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:16px;">
                <tr>
                  <td style="padding:5px 0;color:#6b7280;width:100px;">Client</td>
                  <td style="padding:5px 0;">${clientName}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Téléphone</td>
                  <td style="padding:5px 0;">${booking.phone || "-"}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Email</td>
                  <td style="padding:5px 0;">${booking.client_email || "-"}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Réservation</td>
                  <td style="padding:5px 0;font-weight:500;">#${booking.booking_id}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Coiffeur</td>
                  <td style="padding:5px 0;">${booking.hairdresser_name || "Non assigné"}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#6b7280;">Montant</td>
                  <td style="padding:5px 0;">${booking.total_price ? booking.total_price + " €" : "-"}</td>
                </tr>
              </table>
              
              <a href="${siteUrl}/admin/booking" style="display:block;text-align:center;background:#000;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">
                Voir les réservations
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:10px;text-align:center;background:#fafafa;font-size:11px;color:#9ca3af;">
              OOM · Notification d'annulation admin
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        for (const admin of admins) {
          try {
            const { error: emailError } = await resend.emails.send({
              from: "OOM <booking@oomworld.com>",
              to: [admin.email],
              subject: `❌ Annulation #${booking.booking_id} - ${clientName} - ${booking.hotel_name}`,
              html: adminEmailHtml,
            });

            if (emailError) {
              console.error(`[handle-booking-cancellation] Admin email error:`, emailError);
              results.errors.push(`Failed to email admin: ${admin.email}`);
            } else {
              console.log(`[handle-booking-cancellation] Email sent to admin: ${admin.email}`);
              results.adminNotified = true;
            }
          } catch (e) {
            console.error(`[handle-booking-cancellation] Admin email exception:`, e);
          }
        }
      } else {
        console.log("[handle-booking-cancellation] No active admins found");
      }
    } catch (err) {
      console.error("[handle-booking-cancellation] Admin notification error:", err);
      results.errors.push("Admin notification failed");
    }

    console.log("[handle-booking-cancellation] Results:", results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[handle-booking-cancellation] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
