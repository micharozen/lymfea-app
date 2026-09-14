/**
 * Recalcule les rémunérations praticien d'une réservation déjà payée.
 *
 * Les lignes `therapist_payouts` sont écrites au moment du paiement, pour les
 * praticiens acceptés À CET INSTANT. Depuis qu'une réservation peut être partagée
 * entre plusieurs praticiens (issue #547), le staffing peut encore bouger après :
 * un praticien prend le soin corps, la cliente paie, un second prend le soin
 * visage. Sans recalcul, le premier reste payé sur la durée totale et le second
 * n'a aucune ligne.
 *
 * Appelée après une acceptation quand la réservation est déjà engagée
 * financièrement. Idempotente : elle réécrit l'allocation complète du booking.
 * Aucun mouvement d'argent n'est déclenché — ces lignes alimentent
 * l'auto-facturation (Stripe Connect est en décommissionnement).
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { fetchPayoutTherapists, buildTherapistPayoutLegs } from "../_shared/therapistPayouts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookingTreatmentRow {
  therapist_id: string | null;
  treatment_id: string | null;
  is_addon: boolean | null;
  treatment_menus: { duration: number | null } | null;
  treatment_variants: { duration: number | null } | null;
}

/** Seuls ces statuts de paiement ont pu générer des lignes de rémunération. */
const ENGAGED_PAYMENT_STATUSES = ["paid", "charged_to_room", "offert"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const { bookingId } = await req.json();
    if (!bookingId) throw new Error("bookingId is required");

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id, therapist_id, guest_count, total_price, payment_status, is_out_of_hours,
        hotels(vat, hotel_commission, out_of_hours_surcharge_percent),
        booking_treatments(therapist_id, treatment_id, is_addon, treatment_menus(duration), treatment_variants(duration))
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) throw new Error(`Booking not found: ${bookingId}`);

    if (!ENGAGED_PAYMENT_STATUSES.includes(String(booking.payment_status))) {
      // Rien n'a encore été écrit : les lignes seront créées au paiement, avec le
      // staffing d'alors. Pas d'erreur, c'est le cas nominal.
      return new Response(
        JSON.stringify({ success: true, skipped: "not_paid" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const hotel = booking.hotels as unknown as {
      vat?: number | null;
      hotel_commission?: number | null;
      out_of_hours_surcharge_percent?: number | null;
    } | null;
    const vatRate = hotel?.vat || 20;
    const hotelCommissionRate = hotel?.hotel_commission || 10;
    const grossHT = (Number(booking.total_price) || 0) / (1 + vatRate / 100);

    const therapists = await fetchPayoutTherapists(supabase, booking.id, booking.therapist_id);
    if (therapists.length === 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: "no_therapist" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const treatmentRows = (booking.booking_treatments ?? []) as unknown as BookingTreatmentRow[];
    const treatments = treatmentRows.map((bt) => ({
      // La durée réservée est celle de la variante quand il y en a une.
      duration: bt.treatment_variants?.duration ?? bt.treatment_menus?.duration ?? null,
      therapist_id: bt.therapist_id ?? null,
      treatment_id: bt.treatment_id ?? null,
      is_addon: bt.is_addon ?? false,
    }));

    const { legs } = buildTherapistPayoutLegs({
      therapists,
      treatments,
      guestCount: Number(booking.guest_count) || 1,
      isOutOfHours: !!booking.is_out_of_hours,
      surchargePercent: Number(hotel?.out_of_hours_surcharge_percent ?? 0) || 0,
      capTotal: grossHT - grossHT * (hotelCommissionRate / 100),
    });

    const { data: existing } = await supabase
      .from("therapist_payouts")
      .select("id, therapist_id, amount")
      .eq("booking_id", booking.id);

    const existingByTherapist = new Map(
      (existing ?? []).map((row: { id: string; therapist_id: string; amount: number }) => [
        row.therapist_id,
        row,
      ]),
    );

    let updated = 0;
    let inserted = 0;
    for (const leg of legs) {
      if (leg.amount <= 0) continue;
      const current = existingByTherapist.get(leg.therapistId);
      if (current) {
        if (Number(current.amount) === leg.amount) continue;
        const { error } = await supabase
          .from("therapist_payouts")
          .update({ amount: leg.amount, updated_at: new Date().toISOString() })
          .eq("id", current.id);
        if (error) throw error;
        updated++;
      } else {
        const { error } = await supabase.from("therapist_payouts").insert({
          therapist_id: leg.therapistId,
          booking_id: booking.id,
          amount: leg.amount,
          status: "completed",
          stripe_transfer_id: null,
        });
        if (error) throw error;
        inserted++;
      }
    }

    console.log(
      `[SYNC-PAYOUTS] Booking ${bookingId}: ${legs.length} jambe(s), ${inserted} créée(s), ${updated} corrigée(s)`,
    );

    return new Response(
      JSON.stringify({ success: true, inserted, updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[SYNC-PAYOUTS]", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
