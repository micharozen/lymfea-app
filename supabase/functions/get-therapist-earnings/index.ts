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
    // Use anon key for auth verification
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Use service role key to bypass RLS for reading therapist profile
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error("User not authenticated");
    }

    console.log("User authenticated:", userData.user.id);

    // Get therapist profile with stripe_account_id using admin client
    const { data: therapist, error: therapistError } = await supabaseAdmin
      .from("therapists")
      .select("id, stripe_account_id, stripe_onboarding_completed")
      .eq("user_id", userData.user.id)
      .single();

    console.log("Therapist query result:", { therapist, error: therapistError });

    if (therapistError || !therapist) {
      throw new Error("Therapist profile not found");
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
    if (!therapist.stripe_account_id) {
      console.log("No Stripe account connected for therapist:", therapist.id);
      return new Response(JSON.stringify({
        total: 0,
        payouts: [],
        stripeAccountId: null,
        stripeOnboardingCompleted: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Sync Stripe onboarding status (so the app doesn't rely only on webhooks)
    let stripeOnboardingCompleted = therapist.stripe_onboarding_completed || false;
    try {
      const account = await stripe.accounts.retrieve(therapist.stripe_account_id);
      const isOnboardingComplete =
        !!account.details_submitted && (!!account.charges_enabled || !!account.payouts_enabled);

      if (isOnboardingComplete && !stripeOnboardingCompleted) {
        const { error: updateError } = await supabaseAdmin
          .from("therapists")
          .update({ stripe_onboarding_completed: true, updated_at: new Date().toISOString() })
          .eq("id", therapist.id);

        if (updateError) {
          console.warn("Failed to update stripe_onboarding_completed", updateError);
        } else {
          stripeOnboardingCompleted = true;
        }
      }
    } catch (err) {
      console.warn("Could not retrieve Stripe account to sync onboarding status", err);
    }

    // Get transfers to this connected account
    const transfers = await stripe.transfers.list({
      destination: therapist.stripe_account_id,
      created: {
        gte: Math.floor(startDate.getTime() / 1000),
      },
      limit: 100,
    });

    console.log(
      `Found ${transfers.data.length} transfers for account ${therapist.stripe_account_id}`
    );

    // Extract all booking IDs from transfers
    const bookingIds = transfers.data
      .map((t: Stripe.Transfer) => t.metadata?.booking_id)
      .filter((id: string | undefined): id is string => !!id);

    // Fetch all bookings in a single query (much faster than N queries)
    let bookingsMap: Record<string, { booking_id: number; hotel_name: string; hotel_image: string | null }> = {};
    
    if (bookingIds.length > 0) {
      const { data: bookings } = await supabaseAdmin
        .from("bookings")
        .select("id, booking_id, hotel_id, hotel_name, hotels(image)")
        .in("id", bookingIds);

      if (bookings) {
        for (const booking of bookings) {
          bookingsMap[booking.id] = {
            booking_id: booking.booking_id,
            hotel_name: booking.hotel_name || "Unknown Hotel",
            hotel_image: (booking as any).hotels?.image || null,
          };
        }
      }
    }

    // Calculate total and format payouts
    let total = 0;
    const payouts = [];

    for (const transfer of transfers.data) {
      const amount = transfer.amount / 100; // Convert from cents
      total += amount;

      const bookingId = transfer.metadata?.booking_id;
      const bookingInfo = bookingId ? bookingsMap[bookingId] : null;

      payouts.push({
        id: transfer.id,
        booking_id: bookingInfo?.booking_id || null,
        hotel_name: bookingInfo?.hotel_name || "Unknown Hotel",
        hotel_image: bookingInfo?.hotel_image || null,
        amount: amount,
        status: transfer.reversed ? "reversed" : "completed",
        date: new Date(transfer.created * 1000).toISOString().split("T")[0],
      });
    }

    // Sort payouts by date (most recent first)
    payouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return new Response(
      JSON.stringify({
        total,
        payouts,
        stripeAccountId: therapist.stripe_account_id,
        stripeOnboardingCompleted,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching therapist earnings:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
