import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { hotelId, bookingData, treatments, therapistGender } = await req.json();

    if (!hotelId || !bookingData || !treatments || treatments.length === 0) {
      throw new Error("Données manquantes pour créer le brouillon");
    }

    const { data: hotelData } = await supabase
      .from('hotels')
      .select('name')
      .eq('id', hotelId)
      .single();

    let totalPrice = 0;
    let totalDuration = 0;

    for (const item of treatments) {
      if (item.variantId) {
        const { data: variant } = await supabase
          .from('treatment_variants')
          .select('price, duration')
          .eq('id', item.variantId)
          .single();
        if (variant) {
          totalPrice += (variant.price || 0) * item.quantity;
          totalDuration += variant.duration * item.quantity;
        }
      } else {
        const { data: treatment } = await supabase
          .from('treatment_menus')
          .select('price, duration')
          .eq('id', item.id)
          .single();
        if (treatment) {
          totalPrice += (treatment.price || 0) * item.quantity;
          totalDuration += (treatment.duration || 0) * item.quantity;
        }
      }
    }

    const { data: newBookingId, error: rpcError } = await supabase.rpc('reserve_trunk_atomically', {
      _hotel_id: hotelId,
      _hotel_name: hotelData?.name || 'Hotel',
      _booking_date: bookingData.date,
      _booking_time: bookingData.time,
      _duration: totalDuration,
      _total_price: totalPrice,
      _client_first_name: 'DRAFT',
      _client_last_name: 'BOOKING',
      _client_email: 'draft@lymfea.com',
      _phone: '+33000000000',
      _room_number: 'N/A',
      _language: 'fr',
      _payment_method: 'card',
      _status: 'awaiting_payment',
      _payment_status: 'pending',
      _client_note: '',
      _therapist_gender: therapistGender || null,
      _treatment_ids: treatments.map((t: any) => t.id)
    });

    if (rpcError) throw rpcError;
    if (!newBookingId) throw new Error("Le créneau n'a pas pu être réservé (conflit).");

    for (const item of treatments) {
      await supabase.from('booking_treatments').insert({
        booking_id: newBookingId,
        treatment_id: item.id,
        variant_id: item.variantId || null
      });
    }

    return new Response(JSON.stringify({ success: true, bookingId: newBookingId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Erreur create-draft-booking:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});