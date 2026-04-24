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
      .select('name, booking_hold_enabled, booking_hold_duration_minutes')
      .eq('id', hotelId)
      .single();

    if (hotelData && hotelData.booking_hold_enabled === false) {
      return new Response(
        JSON.stringify({ success: false, reason: 'hold_disabled' }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const holdMinutes = hotelData?.booking_hold_duration_minutes ?? 5;
    const holdExpiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();

    let totalPrice = 0;
    let totalDuration = 0;

    const variantIds = treatments
      .filter((t: any) => t.variantId)
      .map((t: any) => t.variantId);
    const menuIds = treatments
      .filter((t: any) => !t.variantId)
      .map((t: any) => t.id);

    const [variantsRes, menusRes] = await Promise.all([
      variantIds.length
        ? supabase.from('treatment_variants').select('id, price, duration').in('id', variantIds)
        : Promise.resolve({ data: [] as any[] }),
      menuIds.length
        ? supabase.from('treatment_menus').select('id, price, duration').in('id', menuIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const variantMap = new Map((variantsRes.data ?? []).map((v: any) => [v.id, v]));
    const menuMap = new Map((menusRes.data ?? []).map((m: any) => [m.id, m]));

    for (const item of treatments) {
      const row: any = item.variantId ? variantMap.get(item.variantId) : menuMap.get(item.id);
      if (!row) continue;
      totalPrice += (row.price || 0) * item.quantity;
      totalDuration += (row.duration || 0) * item.quantity;
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

    await supabase
      .from('bookings')
      .update({ hold_expires_at: holdExpiresAt })
      .eq('id', newBookingId);

    await supabase.from('booking_treatments').insert(
      treatments.map((item: any) => ({
        booking_id: newBookingId,
        treatment_id: item.id,
        variant_id: item.variantId || null,
      }))
    );

    return new Response(
      JSON.stringify({ success: true, bookingId: newBookingId, holdExpiresAt, holdDurationMinutes: holdMinutes }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Erreur create-draft-booking:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});