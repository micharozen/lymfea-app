import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolveClientLanguage } from "../_shared/client-language.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * NOTIFICATION DE MODIFICATION D'UNE RÉSERVATION EXISTANTE
 *
 * Déclenchée quand le spa change la date, l'heure ou les soins d'une réservation
 * déjà prise. Jusqu'ici ce chemin ne prévenait personne : les praticiens
 * assignés se déplaçaient sur l'ancien créneau et le client ne savait rien.
 *
 * - Praticiens du roster : notification in-app + push.
 * - Client : e-mail + SMS via `send-booking-notification` (type "modification").
 *
 * Volontairement séparée de `trigger-new-booking-notifications`, qui annonce une
 * NOUVELLE réservation (vagues de diffusion, Slack, lien de paiement) — rien de
 * tout cela n'a de sens sur une simple mise à jour.
 */

interface ModifiedChanges {
  date?: boolean;
  time?: boolean;
  treatments?: boolean;
}

interface NotifyBookingModifiedRequest {
  bookingId: string;
  changes?: ModifiedChanges;
  /** Faux quand l'appelant a déjà notifié ce public par un autre chemin
   *  (assignation praticien / passage en confirmé), pour éviter les doublons. */
  notifyTherapists?: boolean;
  notifyClient?: boolean;
}

/** Statuts pour lesquels annoncer une modification n'a aucun sens. */
const SKIPPED_STATUSES = ["cancelled", "draft", "completed", "no_show", "noshow"];

function formatChangeSummary(changes: ModifiedChanges | undefined, language: "fr" | "en"): string {
  const parts: string[] = [];
  const fr = language === "fr";
  if (changes?.date) parts.push(fr ? "date" : "date");
  if (changes?.time) parts.push(fr ? "horaire" : "time");
  if (changes?.treatments) parts.push(fr ? "soins" : "treatments");
  if (parts.length === 0) return fr ? "détails" : "details";
  return parts.join(", ");
}

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

    const body = (await req.json()) as NotifyBookingModifiedRequest;
    const { bookingId, changes } = body;
    const notifyTherapists = body.notifyTherapists !== false;
    const notifyClient = body.notifyClient !== false;

    if (!bookingId) {
      throw new Error("Booking ID is required");
    }

    console.log("[notify-booking-modified] Processing", { bookingId, changes, notifyTherapists, notifyClient });

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `id, booking_id, status, booking_date, booking_time, hotel_id, hotel_name,
         client_first_name, client_last_name, client_email, phone, therapist_id,
         language, customer_id`
      )
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Booking not found: ${bookingError?.message ?? "unknown"}`);
    }

    if (SKIPPED_STATUSES.includes(String(booking.status))) {
      console.log("[notify-booking-modified] Skipped status", booking.status);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `status=${booking.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let customerLanguage: string | null = null;
    if (booking.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("language")
        .eq("id", booking.customer_id)
        .single();
      customerLanguage = (customer as { language?: string | null } | null)?.language ?? null;
    }
    const language = resolveClientLanguage(customerLanguage, (booking as { language?: string | null }).language);

    const timeStr = String(booking.booking_time ?? "").substring(0, 5);
    const dateStr = new Date(booking.booking_date).toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

    const errors: string[] = [];
    let therapistsNotified = 0;
    let clientEmailSent = false;
    let clientSmsSent = false;

    // ---------------------------------------------------------------
    // 1. Praticiens engagés sur la réservation
    // ---------------------------------------------------------------
    if (notifyTherapists) {
      // Le roster fait foi (duo = plusieurs praticiens) ; therapist_id reste le
      // repli pour les réservations solo historiques sans ligne de roster.
      const { data: roster } = await supabase
        .from("booking_therapists")
        .select("therapist_id")
        .eq("booking_id", bookingId)
        .in("status", ["accepted", "reconfirm_pending"]);

      const therapistIds = [
        ...new Set(
          [
            ...(roster ?? []).map((r: { therapist_id: string }) => r.therapist_id),
            booking.therapist_id,
          ].filter((id): id is string => !!id)
        ),
      ];

      if (therapistIds.length > 0) {
        const { data: therapists, error: therapistsError } = await supabase
          .from("therapists")
          .select("id, user_id, first_name, last_name")
          .in("id", therapistIds);
        if (therapistsError) {
          console.error("[notify-booking-modified] Error fetching therapists:", therapistsError);
          errors.push("Failed to fetch therapists");
        }

        const withUserId = (therapists ?? []).filter((t: { user_id: string | null }) => !!t.user_id);
        const message = `🔄 Réservation #${booking.booking_id} modifiée (${formatChangeSummary(changes, "fr")}) · ${dateStr} à ${timeStr} · ${booking.hotel_name ?? ""}`;

        if (withUserId.length > 0) {
          const { error: notifError } = await supabase.from("notifications").insert(
            withUserId.map((t: { user_id: string }) => ({
              user_id: t.user_id,
              booking_id: booking.id,
              type: "booking_modified",
              message,
            }))
          );
          if (notifError) {
            console.error("[notify-booking-modified] In-app notification error:", notifError);
            errors.push("Failed to create in-app notifications");
          }
        }

        const pushResults = await Promise.all(
          withUserId.map(async (t: { user_id: string; first_name: string | null }) => {
            try {
              const { error: pushError } = await supabase.functions.invoke("send-push-notification", {
                body: {
                  userId: t.user_id,
                  title: "🔄 Réservation modifiée",
                  body: `#${booking.booking_id} · ${dateStr} à ${timeStr} · ${booking.hotel_name ?? ""}`,
                  data: {
                    bookingId: booking.id,
                    type: "booking_modified",
                    url: `/pwa/booking/${booking.id}`,
                  },
                },
                headers: { Authorization: `Bearer ${serviceKey}` },
              });
              if (pushError) {
                console.error(`[notify-booking-modified] Push error for ${t.first_name}:`, pushError);
                return false;
              }
              return true;
            } catch (e) {
              console.error(`[notify-booking-modified] Push exception for ${t.first_name}:`, e);
              return false;
            }
          })
        );
        therapistsNotified = pushResults.filter(Boolean).length;
      } else {
        console.log("[notify-booking-modified] No therapist engaged on this booking");
      }
    }

    // ---------------------------------------------------------------
    // 2. Client
    // ---------------------------------------------------------------
    if (notifyClient) {
      const channels: ("email" | "sms")[] = [];
      if (booking.client_email) channels.push("email");
      if (booking.phone) channels.push("sms");

      if (channels.length === 0) {
        console.log("[notify-booking-modified] No client contact details");
      } else {
        const { data: notifResult, error: notifError } = await supabase.functions.invoke(
          "send-booking-notification",
          {
            body: { bookingId, language, channels, type: "modification" },
            headers: { Authorization: `Bearer ${serviceKey}` },
          }
        );
        if (notifError) {
          console.error("[notify-booking-modified] Client notification error:", notifError);
          errors.push("Failed to notify client");
        } else {
          clientEmailSent = notifResult?.emailSent === true;
          clientSmsSent = notifResult?.smsSent === true;
          if (notifResult?.errors) errors.push(...notifResult.errors);
        }
      }
    }

    console.log("[notify-booking-modified] Done", { therapistsNotified, clientEmailSent, clientSmsSent, errors });

    return new Response(
      JSON.stringify({
        success: true,
        therapistsNotified,
        clientEmailSent,
        clientSmsSent,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[notify-booking-modified] error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
