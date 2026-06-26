import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[GENERATE-INVOICES] Starting monthly invoice generation");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Calculer le mois précédent
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const startDate = lastMonth.toISOString().split('T')[0];
    const endDate = lastMonthEnd.toISOString().split('T')[0];

    console.log(`[GENERATE-INVOICES] Period: ${startDate} to ${endDate}`);

    // Récupérer tous les bookings "Add to Room" payés du mois dernier
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        *,
        hotel:hotels!inner(id, name, currency)
      `)
      .eq('payment_method', 'room')
      .gte('booking_date', startDate)
      .lte('booking_date', endDate);

    if (bookingsError) throw bookingsError;

    console.log(`[GENERATE-INVOICES] Found ${bookings?.length || 0} bookings`);

    // Grouper par hôtel
    const hotelBookings = bookings?.reduce((acc: any, booking: any) => {
      const hotelId = booking.hotel_id;
      if (!acc[hotelId]) {
        acc[hotelId] = {
          hotel: booking.hotel,
          bookings: []
        };
      }
      acc[hotelId].bookings.push(booking);
      return acc;
    }, {});

    // Créer une facture Stripe pour chaque hôtel
    for (const hotelId in hotelBookings) {
      const { hotel, bookings: hotelBookingsList } = hotelBookings[hotelId];
      
      console.log(`[GENERATE-INVOICES] Processing hotel: ${hotel.name}`);

      // Créer ou récupérer le customer Stripe pour l'hôtel
      let customer;
      const existingCustomers = await stripe.customers.search({
        query: `metadata['hotel_id']:'${hotelId}'`,
      });

      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
      } else {
        customer = await stripe.customers.create({
          name: hotel.name,
          metadata: { hotel_id: hotelId },
        });
      }

      console.log(`[GENERATE-INVOICES] Customer: ${customer.id}`);

      // Créer la facture
      const invoice = await stripe.invoices.create({
        customer: customer.id,
        currency: hotel.currency?.toLowerCase() || 'eur',
        description: `Prestations coiffure - ${lastMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
        metadata: {
          hotel_id: hotelId,
          period_start: startDate,
          period_end: endDate,
        },
        collection_method: 'send_invoice',
        days_until_due: 30,
      });

      console.log(`[GENERATE-INVOICES] Invoice created: ${invoice.id}`);

      // Ajouter chaque booking comme ligne de facture
      for (const booking of hotelBookingsList) {
        await stripe.invoiceItems.create({
          customer: customer.id,
          invoice: invoice.id,
          amount: Math.round((booking.total_price || 0) * 100), // Stripe utilise les centimes
          currency: hotel.currency?.toLowerCase() || 'eur',
          description: `#${booking.booking_id} - ${booking.client_first_name} ${booking.client_last_name} - ${new Date(booking.booking_date).toLocaleDateString('fr-FR')}`,
          metadata: {
            booking_id: booking.id,
          },
        });
      }

      // Finaliser et envoyer la facture
      await stripe.invoices.finalizeInvoice(invoice.id);
      await stripe.invoices.sendInvoice(invoice.id);

      console.log(`[GENERATE-INVOICES] Invoice sent for ${hotel.name}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Generated ${Object.keys(hotelBookings || {}).length} invoices` 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[GENERATE-INVOICES] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
