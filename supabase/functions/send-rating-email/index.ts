import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { brand } from "../_shared/brand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RatingEmailRequest {
  bookingId: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { bookingId }: RatingEmailRequest = await req.json();

    if (!bookingId) {
      throw new Error("bookingId is required");
    }

    // Fetch booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select(`
        id,
        booking_id,
        client_email,
        client_first_name,
        client_last_name,
        therapist_id,
        therapist_name,
        hotel_name
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error("Booking not found");
    }

    if (!booking.client_email) {
      console.log("No client email for booking", bookingId);
      return new Response(
        JSON.stringify({ success: false, message: "No client email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Generate unique rating token
    const ratingToken = crypto.randomUUID();

    // Store the token in therapist_ratings table (pre-create record)
    const { error: insertError } = await supabaseClient
      .from("therapist_ratings")
      .insert({
        booking_id: booking.id,
        therapist_id: booking.therapist_id,
        rating: 5, // Default, will be updated when client rates
        rating_token: ratingToken,
      });

    if (insertError) {
      console.error("Error creating rating record:", insertError);
      throw new Error("Failed to create rating record");
    }

    // Build rating URL
    const siteUrl = Deno.env.get("SITE_URL") || `https://${brand.appDomain}`;
    const ratingUrl = `${siteUrl}/rate/${ratingToken}`;

    // Send email
    const resend = new Resend(resendKey);
    
    const emailResponse = await resend.emails.send({
      from: brand.emails.from.default,
      to: [booking.client_email],
      subject: `Rate your experience with ${booking.therapist_name || "your therapist"}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background: #f5f5f5;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            <h1 style="font-size: 24px; font-weight: 600; margin: 0 0 16px 0; color: #111;">
              Thank you, ${booking.client_first_name}!
            </h1>
            <p style="font-size: 16px; color: #666; line-height: 1.6; margin: 0 0 24px 0;">
              We hope you enjoyed your experience at <strong>${booking.hotel_name}</strong> with 
              <strong>${booking.therapist_name || "your therapist"}</strong>.
            </p>
            <p style="font-size: 16px; color: #666; line-height: 1.6; margin: 0 0 32px 0;">
              Your feedback helps us provide the best service. Please take a moment to rate your experience.
            </p>
            <a href="${ratingUrl}" 
               style="display: inline-block; background: #000; color: white; padding: 16px 32px; border-radius: 50px; text-decoration: none; font-weight: 500; font-size: 16px;">
              Rate your experience
            </a>
            <p style="font-size: 14px; color: #999; margin: 32px 0 0 0;">
              Thank you for choosing ${brand.name}.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Rating email sent:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: (emailResponse as any).id || null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Error in send-rating-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
