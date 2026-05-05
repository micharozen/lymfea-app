import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DraftItem {
  treatmentId: string;
  variantId?: string | null;
  date: string;
  time: string;
  duration?: number;
  quantity: number;
  guestCount?: number;
}

interface LegacyTreatment {
  id: string;
  variantId?: string | null;
  quantity: number;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Track drafts created in this request so we can rollback on failure.
  const createdDraftIds: string[] = [];

  try {
    const body = await req.json();
    const { hotelId, therapistGender } = body;

    if (!hotelId) {
      throw new Error("Données manquantes pour créer le brouillon");
    }

    // -------- Normalise legacy single-shot payload into items[] --------
    let items: DraftItem[];
    if (Array.isArray(body.items) && body.items.length > 0) {
      items = body.items as DraftItem[];
    } else if (body.bookingData && Array.isArray(body.treatments) && body.treatments.length > 0) {
      const { date, time } = body.bookingData;
      const treatments = body.treatments as LegacyTreatment[];
      items = [{
        treatmentId: treatments[0].id,
        variantId: treatments[0].variantId ?? null,
        date,
        time,
        quantity: treatments.reduce((acc, t) => acc + (t.quantity || 1), 0),
        guestCount: body.guestCount,
        // Legacy multi-treatment-on-one-slot collapses all treatments under
        // the first booking. Other treatments are tracked via booking_treatments.
      }];
      // Stash the full legacy treatment list so we can fan it out below.
      (items[0] as any).__legacyTreatments = treatments;
    } else {
      throw new Error("Données manquantes pour créer le brouillon");
    }

    const { data: hotelData } = await supabase
      .from('hotels')
      .select('name, booking_hold_enabled, booking_hold_duration_minutes')
      .eq('id', hotelId)
      .single();

    // Multi-slot bookings (items.length > 1) must always create drafts:
    // confirm-setup-intent requires bookingIds[] to confirm each slot.
    // Only reject for single-item bookings when the venue has hold disabled.
    if (hotelData && hotelData.booking_hold_enabled === false && items.length <= 1) {
      return new Response(
        JSON.stringify({ success: false, reason: 'hold_disabled' }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const holdMinutes = hotelData?.booking_hold_duration_minutes ?? 5;
    const holdExpiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();

    // Pre-fetch all variants/menus referenced across items in two batched queries.
    const allVariantIds = new Set<string>();
    const allMenuIds = new Set<string>();
    for (const item of items) {
      const legacy = (item as any).__legacyTreatments as LegacyTreatment[] | undefined;
      if (legacy) {
        for (const t of legacy) {
          if (t.variantId) allVariantIds.add(t.variantId);
          else allMenuIds.add(t.id);
        }
      } else {
        if (item.variantId) allVariantIds.add(item.variantId);
        else allMenuIds.add(item.treatmentId);
      }
    }

    const [variantsRes, menusRes] = await Promise.all([
      allVariantIds.size
        ? supabase.from('treatment_variants').select('id, price, duration').in('id', Array.from(allVariantIds))
        : Promise.resolve({ data: [] as any[] }),
      allMenuIds.size
        ? supabase.from('treatment_menus').select('id, price, duration').in('id', Array.from(allMenuIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const variantMap = new Map((variantsRes.data ?? []).map((v: any) => [v.id, v]));
    const menuMap = new Map((menusRes.data ?? []).map((m: any) => [m.id, m]));

    const groupId = items.length > 1 ? crypto.randomUUID() : null;
    const bookingIds: string[] = [];

    for (const item of items) {
      const legacy = (item as any).__legacyTreatments as LegacyTreatment[] | undefined;
      const effectiveGuestCount = Math.max(1, item.guestCount ?? 1);

      let totalPrice = 0;
      let totalDuration = 0;
      let treatmentIdsForRpc: string[];

      if (legacy) {
        // Legacy mode: sum across all treatments for the single slot.
        for (const t of legacy) {
          const row: any = t.variantId ? variantMap.get(t.variantId) : menuMap.get(t.id);
          if (!row) continue;
          totalPrice += (row.price || 0) * t.quantity;
          totalDuration += (row.duration || 0) * t.quantity;
        }
        treatmentIdsForRpc = legacy.map((t) => t.id);
      } else {
        const row: any = item.variantId ? variantMap.get(item.variantId) : menuMap.get(item.treatmentId);
        if (row) {
          totalPrice += (row.price || 0) * item.quantity;
          totalDuration += (row.duration || 0) * item.quantity;
        }
        if (item.duration && totalDuration === 0) totalDuration = item.duration;
        treatmentIdsForRpc = [item.treatmentId];
      }

      const { data: newBookingId, error: rpcError } = await supabase.rpc('reserve_trunk_atomically', {
        _hotel_id: hotelId,
        _hotel_name: hotelData?.name || 'Hotel',
        _booking_date: item.date,
        _booking_time: item.time,
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
        _payment_status: 'awaiting_payment',
        _client_note: '',
        _therapist_gender: therapistGender || null,
        _treatment_ids: treatmentIdsForRpc,
        _guest_count: effectiveGuestCount,
      });

      if (rpcError) throw rpcError;
      if (!newBookingId) throw new Error("Le créneau n'a pas pu être réservé (conflit).");

      createdDraftIds.push(newBookingId);
      bookingIds.push(newBookingId);

      const updatePayload: Record<string, unknown> = {
        hold_expires_at: holdExpiresAt,
        guest_count: effectiveGuestCount,
      };
      if (groupId) updatePayload.booking_group_id = groupId;

      const { error: updateErr } = await supabase
        .from('bookings')
        .update(updatePayload)
        .eq('id', newBookingId);
      if (updateErr) throw updateErr;

      const treatmentRows = legacy
        ? legacy.map((t) => ({
            booking_id: newBookingId,
            treatment_id: t.id,
            variant_id: t.variantId || null,
          }))
        : Array.from({ length: item.quantity || 1 }, () => ({
            booking_id: newBookingId,
            treatment_id: item.treatmentId,
            variant_id: item.variantId || null,
          }));

      const { error: btErr } = await supabase.from('booking_treatments').insert(treatmentRows);
      if (btErr) throw btErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        groupId,
        bookingIds,
        bookingId: bookingIds[0],
        holdExpiresAt,
        holdDurationMinutes: holdMinutes,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Erreur create-draft-booking:", error);

    // Rollback: drop any drafts that succeeded earlier in this request.
    if (createdDraftIds.length > 0) {
      try {
        await supabase
          .from('bookings')
          .delete()
          .in('id', createdDraftIds)
          .eq('status', 'awaiting_payment');
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr);
      }
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
