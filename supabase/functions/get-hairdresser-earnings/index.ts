import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error("User not authenticated");
    }

    // Get hairdresser profile with stripe_account_id
    const { data: hairdresser, error: hairdresserError } = await supabaseClient
      .from("hairdressers")
      .select("id, stripe_account_id")
      .eq("user_id", userData.user.id)
      .single();

    if (hairdresserError || !hairdresser) {
      throw new Error("Hairdresser profile not found");
    }

    const { period } = await req.json();
    
    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case "last_month":
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      case "last_3_months":
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case "this_month":
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // If no Stripe account connected, return empty data
    if (!hairdresser.stripe_account_id) {
      console.log("No Stripe account connected for hairdresser:", hairdresser.id);
      return new Response(JSON.stringify({
        total: 0,
        payouts: [],
        stripeAccountId: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Get transfers to this connected account
    const transfers = await stripe.transfers.list({
      destination: hairdresser.stripe_account_id,
      created: {
        gte: Math.floor(startDate.getTime() / 1000),
      },
      limit: 100,
    });

    console.log(`Found ${transfers.data.length} transfers for account ${hairdresser.stripe_account_id}`);

    // Calculate total and format payouts
    let total = 0;
    const payouts = [];

    for (const transfer of transfers.data) {
      const amount = transfer.amount / 100; // Convert from cents
      total += amount;

      // Get booking info from transfer metadata
      const bookingId = transfer.metadata?.booking_id;
      let hotelName = "Unknown Hotel";
      let hotelImage = null;
      let bookingRefId = null;

      if (bookingId) {
        // Fetch booking details
        const { data: booking } = await supabaseClient
          .from("bookings")
          .select("booking_id, hotel_id, hotel_name, hotels(image)")
          .eq("id", bookingId)
          .single();

        if (booking) {
          bookingRefId = booking.booking_id;
          hotelName = booking.hotel_name || "Unknown Hotel";
          hotelImage = (booking as any).hotels?.image || null;
        }
      }

      payouts.push({
        id: transfer.id,
        booking_id: bookingRefId,
        hotel_name: hotelName,
        hotel_image: hotelImage,
        amount: amount,
        status: transfer.reversed ? "reversed" : "completed",
        date: new Date(transfer.created * 1000).toISOString().split("T")[0],
      });
    }

    // Sort payouts by date (most recent first)
    payouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return new Response(JSON.stringify({
      total,
      payouts,
      stripeAccountId: hairdresser.stripe_account_id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching hairdresser earnings:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
