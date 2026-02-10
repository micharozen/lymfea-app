import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HandleQuoteResponseRequest {
  bookingId: string;
  action: "approve" | "refuse";
  token: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookingId, action, token }: HandleQuoteResponseRequest = await req.json();
    console.log("Handling quote response:", bookingId, "Action:", action);

    if (!bookingId || !action || !token) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action !== "approve" && action !== "refuse") {
      return new Response(
        JSON.stringify({ error: "Invalid action", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get booking and validate token
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Error fetching booking:", bookingError);
      return new Response(
        JSON.stringify({ error: "Booking not found", success: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if booking has already been processed (token cleared or status changed)
    if (!booking.quote_token || booking.status !== "waiting_approval") {
      console.log("Quote already processed for booking:", bookingId, "Status:", booking.status);
      
      let statusMessage = "Ce devis a déjà été traité.";
      if (booking.status === "pending" || booking.status === "confirmed") {
        statusMessage = "Ce devis a déjà été accepté. Votre réservation est en cours de traitement.";
      } else if (booking.status === "cancelled") {
        statusMessage = "Ce devis a déjà été refusé ou la réservation a été annulée.";
      } else if (booking.status === "completed") {
        statusMessage = "Cette prestation a déjà été effectuée.";
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          alreadyProcessed: true,
          currentStatus: booking.status,
          message: statusMessage
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate token
    if (booking.quote_token !== token) {
      console.error("Invalid token for booking:", bookingId);
      return new Response(
        JSON.stringify({ error: "Lien invalide. Veuillez utiliser le lien reçu par email.", success: false }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    if (action === "approve") {
      // Update booking status to pending
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          status: "pending",
          quote_token: null, // Clear the token
        })
        .eq("id", bookingId);

      if (updateError) {
        console.error("Error updating booking:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update booking", success: false }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Notify admins about the quote acceptance via email
      if (resend) {
        try {
          const { data: admins } = await supabase
            .from("admins")
            .select("email, first_name")
            .eq("status", "active");

          if (admins && admins.length > 0) {
            for (const admin of admins) {
              const emailResult = await resend.emails.send({
                from: "OOM World <booking@oomworld.com>",
                to: [admin.email],
                subject: `✅ Devis accepté - Commande #${booking.booking_id}`,
                html: `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="utf-8">
                  </head>
                  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 32px;">
                      <div style="text-align: center; margin-bottom: 24px;">
                        <img src="https://jpvgfxchupfukverhcgt.supabase.co/storage/v1/object/public/assets/OOM_logo-secondary-2.png" alt="OOM World" style="height: 40px;">
                      </div>
                      
                      <div style="background-color: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                        <h2 style="color: #166534; margin: 0 0 12px 0; font-size: 18px;">✅ Devis accepté par le client</h2>
                        <p style="color: #15803d; margin: 0; font-size: 14px;">
                          Le client a accepté le devis pour la commande #${booking.booking_id}. La réservation est maintenant en attente d'assignation d'un coiffeur.
                        </p>
                      </div>
                      
                      <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px;">
                        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Client:</strong> ${booking.client_first_name} ${booking.client_last_name}</p>
                        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Téléphone:</strong> ${booking.phone || 'N/A'}</p>
                        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Hôtel:</strong> ${booking.hotel_name || 'N/A'}</p>
                        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Chambre:</strong> ${booking.room_number || 'N/A'}</p>
                        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Prix accepté:</strong> ${booking.total_price}€</p>
                        <p style="margin: 0; font-size: 14px;"><strong>Date prévue:</strong> ${booking.booking_date} à ${booking.booking_time?.substring(0, 5)}</p>
                      </div>
                      
                      <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px;">
                        OOM World - Luxury Hair Services
                      </p>
                    </div>
                  </body>
                  </html>
                `,
              });
              console.log(`Admin notified of quote acceptance: ${admin.email}`, emailResult);
            }
          }
        } catch (emailError) {
          console.error("Error notifying admin of acceptance:", emailError);
        }
      }

      // Trigger notifications to hairdressers
      try {
        console.log("Triggering push notifications for approved booking:", bookingId);
        await supabase.functions.invoke('trigger-new-booking-notifications', {
          body: { bookingId: bookingId }
        });
      } catch (notifError) {
        console.error("Error triggering hairdresser notifications:", notifError);
      }

      console.log("Quote approved for booking:", bookingId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: "approved",
          message: "Merci ! Un coiffeur va confirmer votre rdv sous peu."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      // Refuse: Update booking status to cancelled
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancellation_reason: "Devis refusé par client",
          quote_token: null, // Clear the token
        })
        .eq("id", bookingId);

      if (updateError) {
        console.error("Error updating booking:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update booking", success: false }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Notify admin about the refusal
      if (resend) {
        try {
          const { data: admins } = await supabase
            .from("admins")
            .select("email, first_name")
            .eq("status", "active");

          if (admins && admins.length > 0) {
            for (const admin of admins) {
              const emailResult = await resend.emails.send({
                from: "OOM World <booking@oomworld.com>",
                to: [admin.email],
                subject: `Devis refusé - Commande #${booking.booking_id}`,
                html: `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="utf-8">
                  </head>
                  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 32px;">
                      <div style="text-align: center; margin-bottom: 24px;">
                        <img src="https://jpvgfxchupfukverhcgt.supabase.co/storage/v1/object/public/assets/OOM_logo-secondary-2.png" alt="OOM World" style="height: 40px;">
                      </div>
                      
                      <div style="background-color: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                        <h2 style="color: #991b1b; margin: 0 0 12px 0; font-size: 18px;">❌ Devis refusé par le client</h2>
                        <p style="color: #7f1d1d; margin: 0; font-size: 14px;">
                          Le client a refusé le devis pour la commande #${booking.booking_id}.
                        </p>
                      </div>
                      
                      <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px;">
                        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Client:</strong> ${booking.client_first_name} ${booking.client_last_name}</p>
                        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Hôtel:</strong> ${booking.hotel_name || 'N/A'}</p>
                        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Prix proposé:</strong> ${booking.total_price}€</p>
                        <p style="margin: 0; font-size: 14px;"><strong>Date prévue:</strong> ${booking.booking_date} à ${booking.booking_time?.substring(0, 5)}</p>
                      </div>
                      
                      <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px;">
                        OOM World - Luxury Hair Services
                      </p>
                    </div>
                  </body>
                  </html>
                `,
              });
              console.log(`Admin notified of quote refusal: ${admin.email}`);
            }
          }
        } catch (emailError) {
          console.error("Error notifying admin of refusal:", emailError);
        }
      }

      console.log("Quote refused for booking:", bookingId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: "refused",
          message: "Demande annulée. Aucun frais ne sera débité."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in handle-quote-response:", error);
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
