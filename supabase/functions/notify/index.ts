import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolveClientLanguage } from "../_shared/client-language.ts";
import { EVENTS } from "./events.ts";
import { notifyClient, notifyTherapists } from "./dispatch.ts";
import { isBookingStarted } from "./schedule.ts";
import { shortDate, shortTime } from "./format.ts";
import type {
  Audience,
  Channel,
  DeliveryResult,
  NotifyBooking,
  NotifyContext,
  NotifyRequest,
} from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * POINT D'ENTRÉE UNIQUE DES NOTIFICATIONS
 *
 * L'appelant décrit un ÉVÉNEMENT métier ; cette fonction décide qui prévenir,
 * par quels canaux, et dans quelle langue :
 *
 *   POST /notify { event, bookingId, audiences?, channels?, language?, context? }
 *
 * `audiences` et `channels` ne servent qu'à RESTREINDRE les valeurs par défaut
 * de l'événement — typiquement pour ne pas doubler un public déjà prévenu par
 * un autre chemin. Les canaux sont en outre intersectés avec ce dont on dispose
 * réellement (adresse e-mail, téléphone, compte praticien).
 *
 * Les événements vivent dans `events.ts`, la résolution des destinataires dans
 * `recipients.ts`, l'envoi dans `dispatch.ts`. Ajouter une notification, c'est
 * ajouter une entrée au registre — pas une edge function.
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase env not configured");
    }
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = (await req.json()) as NotifyRequest;
    const { event, bookingId } = body;

    if (!event || !bookingId) {
      return new Response(
        JSON.stringify({ success: false, error: "event and bookingId are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    const definition = EVENTS[event];
    if (!definition) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown event: ${event}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    console.log("[notify] Request", { event, bookingId, audiences: body.audiences, channels: body.channels });

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `id, booking_id, status, booking_date, booking_time, hotel_id, hotel_name,
         client_first_name, client_last_name, client_email, phone, therapist_id,
         language, customer_id`,
      )
      .eq("id", bookingId)
      .single<NotifyBooking>();

    if (bookingError || !booking) {
      throw new Error(`Booking not found: ${bookingError?.message ?? "unknown"}`);
    }

    if (definition.skipStatuses.includes(booking.status)) {
      console.log("[notify] Skipped status", booking.status);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `status=${booking.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fuseau du lieu : une réservation est « passée » à l'heure du spa, pas à
    // celle du serveur.
    const { data: hotel } = await supabase
      .from("hotels")
      .select("timezone")
      .eq("id", booking.hotel_id)
      .single();
    const timezone = (hotel as { timezone?: string | null } | null)?.timezone ?? null;

    if (definition.skipWhenStarted && isBookingStarted(booking.booking_date, booking.booking_time, timezone)) {
      console.log("[notify] Skipped: booking already started", {
        bookingId,
        date: booking.booking_date,
        time: booking.booking_time,
        timezone,
      });
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "booking_started" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Public demandé ∩ public de l'événement : l'appelant restreint, jamais n'élargit.
    const audiences: Audience[] = body.audiences
      ? definition.audiences.filter((a) => body.audiences!.includes(a))
      : definition.audiences;
    const channels: Channel[] = body.channels
      ? definition.channels.filter((c) => body.channels!.includes(c))
      : definition.channels;

    let customerLanguage: string | null = null;
    if (booking.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("language")
        .eq("id", booking.customer_id)
        .single();
      customerLanguage = (customer as { language?: string | null } | null)?.language ?? null;
    }

    const ctx: NotifyContext = {
      supabase,
      serviceKey,
      booking,
      language: body.language ?? resolveClientLanguage(customerLanguage, booking.language),
      shortDate: shortDate(booking.booking_date),
      time: shortTime(booking.booking_time),
      context: body.context ?? {},
    };

    const deliveries: DeliveryResult[] = [];
    if (audiences.includes("therapists")) {
      deliveries.push(...(await notifyTherapists(event, ctx, channels)));
    }
    if (audiences.includes("client")) {
      deliveries.push(...(await notifyClient(event, ctx, channels)));
    }

    const errors = deliveries.filter((d) => d.error).map((d) => `${d.audience}/${d.channel}: ${d.error}`);
    console.log("[notify] Done", { event, deliveries, errors });

    return new Response(
      JSON.stringify({
        success: true,
        deliveries,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[notify] error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
