import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendEmail } from "../_shared/send-email.ts";
import { sendSms } from "../_shared/send-sms.ts";
import { resolveTreatmentPrice } from "../_shared/treatmentPrice.ts";
import { isDeferredBillingBooking, isRoomChargedBooking } from "../_shared/client-type.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationType = "confirmation" | "reschedule" | "cancellation" | "modification";

interface SendBookingNotificationRequest {
  bookingId: string;
  language: "fr" | "en";
  channels: ("email" | "sms")[];
  clientEmail?: string;
  clientPhone?: string;
  type?: NotificationType;
}

interface BookingTreatment {
  name: string | null;
  price: number | null;
}

function formatPrice(amount: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Date compacte pour le SMS : « jeu. 10 sept. » plutôt que « jeudi 10 septembre 2026 ». */
function formatShortDate(dateIso: string, language: "fr" | "en") {
  const locale = language === "fr" ? "fr-FR" : "en-US";
  return new Date(dateIso).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatLongDate(dateIso: string, language: "fr" | "en") {
  const locale = language === "fr" ? "fr-FR" : "en-US";
  return new Date(dateIso).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildEmailHtml(params: {
  clientName: string;
  hotelName: string;
  bookingId: number;
  dateLong: string;
  bookingTime: string;
  roomNumber: string | null;
  treatments: BookingTreatment[];
  totalPrice: number;
  currency: string;
  language: "fr" | "en";
  /** Facturation différée (partenaire ou note de chambre) : aucune démarche
   *  de paiement côté client. Faux dès que le client a payé par carte. */
  isDeferredBilling: boolean;
  /** Modification a posteriori (date, heure ou soins changés par le spa) :
   *  même récapitulatif, mais annoncé comme une mise à jour et non comme une
   *  première confirmation — sinon le client croit à un doublon. */
  isModification?: boolean;
  /** Réservation encore en attente d'un praticien : on annonce la mise à jour
   *  sans la présenter comme un créneau acquis. */
  isPending?: boolean;
}) {
  const { clientName, hotelName, bookingId, dateLong, bookingTime, roomNumber, treatments, totalPrice, currency, language, isDeferredBilling, isModification, isPending } = params;
  const showPartnerNotice = isDeferredBilling;
  const labels = language === "fr"
    ? {
        title: isModification
          ? (isPending ? "Votre demande a été modifiée" : "Votre réservation a été modifiée")
          : "Votre réservation bien-être est confirmée",
        greeting: `Bonjour ${clientName},`,
        intro: isModification
          ? (isPending
            ? `Votre demande à ${hotelName} a été modifiée. Voici les nouvelles informations, la confirmation vous sera envoyée dès qu'un praticien sera assigné :`
            : `Votre réservation à ${hotelName} a été modifiée. Voici les nouvelles informations :`)
          : `Votre réservation à ${hotelName} est confirmée.`,
        booking: `Réservation #${bookingId}`,
        roomLabel: "Chambre",
        totalLabel: "Total",
        partnerNotice: "Le montant sera facturé à l'hôtel — aucune démarche de paiement n'est nécessaire de votre part.",
        footer: "À très vite !",
      }
    : {
        title: isModification
          ? (isPending ? "Your request has been updated" : "Your booking has been updated")
          : "Your wellness booking is confirmed",
        greeting: `Hello ${clientName},`,
        intro: isModification
          ? (isPending
            ? `Your request at ${hotelName} has been updated. Here are the new details — confirmation will follow as soon as a therapist is assigned:`
            : `Your booking at ${hotelName} has been updated. Here are the new details:`)
          : `Your booking at ${hotelName} is confirmed.`,
        booking: `Booking #${bookingId}`,
        roomLabel: "Room",
        totalLabel: "Total",
        partnerNotice: "The amount will be billed to the hotel — no payment action required on your side.",
        footer: "See you soon!",
      };

  const treatmentRows = treatments
    .map(
      (t) =>
        `<tr><td style="padding:6px 0;">${t.name ?? "Service"}</td><td style="padding:6px 0;text-align:right;">${formatPrice(Number(t.price ?? 0), currency)}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="font-family:Inter,Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 12px 0;">${labels.title}</h2>
  <p style="margin:0 0 12px 0;">${labels.greeting}</p>
  <p style="margin:0 0 16px 0;">${labels.intro}</p>
  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
    <p style="margin:0 0 4px 0;font-weight:600;">${labels.booking}</p>
    <p style="margin:0 0 4px 0;">${dateLong} — ${bookingTime}</p>
    ${roomNumber ? `<p style="margin:0 0 4px 0;">${labels.roomLabel} ${roomNumber}</p>` : ""}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">${treatmentRows}
    <tr><td style="padding-top:8px;border-top:1px solid #e5e7eb;font-weight:600;">${labels.totalLabel}</td><td style="padding-top:8px;border-top:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatPrice(totalPrice, currency)}</td></tr>
  </table>
  ${showPartnerNotice ? `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:12px;color:#3730a3;font-size:13px;margin-bottom:16px;">
    ${labels.partnerNotice}
  </div>` : ""}
  <p style="margin:0;">${labels.footer}</p>
</body></html>`;
}

function buildSmsBody(params: {
  clientName: string;
  hotelName: string;
  dateLong: string;
  bookingTime: string;
  roomNumber: string | null;
  /** Le soin part sur la note de chambre. Un résident hôtel qui a payé par
   *  carte ne doit PAS lire « facturation en chambre ». */
  isRoomCharged: boolean;
  manageUrl: string;
  rebookUrl: string;
  language: "fr" | "en";
  type: NotificationType;
  /** La réservation attend une acceptation praticien (statut 'pending'). */
  isPending: boolean;
}) {
  const {
    clientName,
    hotelName,
    dateLong,
    bookingTime,
    roomNumber,
    isRoomCharged,
    manageUrl,
    rebookUrl,
    language,
    type,
    isPending,
  } = params;

  // Un SMS de déplacement n'annonce qu'une chose : la nouvelle date. Salutation
  // et formule de politesse faisaient basculer le message sur un second segment
  // sans rien apporter — le détail complet part par e-mail.
  if (type === "reschedule") {
    // Un déplacement client renvoie la réservation en 'pending' : le créneau
    // n'est pas acquis tant qu'un praticien ne l'a pas accepté. Annoncer un fait
    // accompli ferait venir le client sur un rendez-vous non pourvu.
    if (isPending) {
      if (language === "fr") {
        return `Demande enregistrée pour le ${dateLong} à ${bookingTime} (${hotelName}). Confirmation à suivre : ${manageUrl}`;
      }
      return `Request received for ${dateLong} at ${bookingTime} (${hotelName}). Confirmation to follow: ${manageUrl}`;
    }
    if (language === "fr") {
      return `Votre soin à ${hotelName} est déplacé au ${dateLong} à ${bookingTime}. Gérer : ${manageUrl}`;
    }
    return `Your treatment at ${hotelName} is moved to ${dateLong} at ${bookingTime}. Manage: ${manageUrl}`;
  }

  // Modification par le spa (date, heure ou soins) : on annonce le nouveau
  // rendez-vous et on renvoie vers le détail, le récapitulatif complet part par
  // e-mail. Comme le déplacement, le message tient sur un seul segment.
  if (type === "modification") {
    // Réservation encore en attente d'un praticien : le nouveau créneau n'est
    // pas acquis. Annoncer un fait accompli ferait venir le client sur un
    // rendez-vous non pourvu (même prudence que sur le déplacement client).
    if (isPending) {
      if (language === "fr") {
        return `Votre demande à ${hotelName} a été modifiée : ${dateLong} à ${bookingTime}. Confirmation à suivre : ${manageUrl}`;
      }
      return `Your request at ${hotelName} has been updated: ${dateLong} at ${bookingTime}. Confirmation to follow: ${manageUrl}`;
    }
    if (language === "fr") {
      return `Votre réservation à ${hotelName} a été modifiée : ${dateLong} à ${bookingTime}. Détail : ${manageUrl}`;
    }
    return `Your booking at ${hotelName} has been updated: ${dateLong} at ${bookingTime}. Details: ${manageUrl}`;
  }

  if (type === "cancellation") {
    if (language === "fr") {
      return `Bonjour ${clientName},\n\nVotre soin à ${hotelName} du ${dateLong} à ${bookingTime} a été annulé.\n\nRéserver à nouveau : ${rebookUrl}\n\nÀ très vite !`;
    }
    return `Hello ${clientName},\n\nYour treatment at ${hotelName} on ${dateLong} at ${bookingTime} has been cancelled.\n\nBook again: ${rebookUrl}\n\nSee you soon!`;
  }

  if (language === "fr") {
    const paymentLine = isRoomCharged
      ? `\n\nFacturation en chambre${roomNumber ? ` ${roomNumber}` : ""}.`
      : "";
    return `Bonjour ${clientName},\n\nVotre soin à ${hotelName} est confirmé le ${dateLong} à ${bookingTime}.${paymentLine}\n\nGérer ma réservation : ${manageUrl}\n\nÀ très vite !`;
  }

  const paymentLine = isRoomCharged
    ? `\n\nCharged to your room${roomNumber ? ` ${roomNumber}` : ""}.`
    : "";
  return `Hello ${clientName},\n\nYour treatment at ${hotelName} is confirmed on ${dateLong} at ${bookingTime}.${paymentLine}\n\nManage my booking: ${manageUrl}\n\nSee you soon!`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[send-booking-notification] Request received", { method: req.method });
    const body = (await req.json()) as SendBookingNotificationRequest;
    const { bookingId, language, channels } = body;
    console.log("[send-booking-notification] Payload", {
      bookingId,
      language,
      channels,
      hasClientEmail: !!body.clientEmail,
      hasClientPhone: !!body.clientPhone,
      clientPhone: body.clientPhone,
    });

    if (!bookingId || !language || !channels || channels.length === 0) {
      throw new Error("Missing required fields: bookingId, language and at least one channel");
    }

    if (!["fr", "en"].includes(language)) {
      throw new Error("Invalid language. Must be 'fr' or 'en'");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase env not configured");
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `id, booking_id, client_first_name, client_last_name, client_email, phone,
         booking_date, booking_time, room_number, total_price, hotel_id, client_type,
         status, payment_status, payment_method, short_token,
         hotels(name, currency)`
      )
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Booking not found: ${bookingError?.message ?? "unknown"}`);
    }

    const bookingClientType = (booking as any).client_type as string | null;
    const bookingPaymentStatus = (booking as any).payment_status as string | null;
    const bookingPaymentMethod = (booking as any).payment_method as string | null;
    // Facturation différée : le client n'a rien à régler maintenant, on peut
    // confirmer sans attendre un paiement. Un résident hôtel qui a choisi la
    // carte n'entre PAS dans ce cas — il doit passer par le gate de paiement
    // comme n'importe quel client, sinon on confirmerait un soin non payé.
    const isDeferredBilling = isDeferredBillingBooking(bookingClientType, {
      paymentMethod: bookingPaymentMethod,
      paymentStatus: bookingPaymentStatus,
    });
    const isPaymentEngaged = bookingPaymentStatus === "paid" || bookingPaymentStatus === "authorized" || bookingPaymentStatus === "engaged";
    // Déplacement, annulation, modification : la réservation existe déjà et le
    // client doit être informé du changement, indépendamment de l'état du
    // paiement. Le gate ne protège que la PREMIÈRE confirmation.
    const isReschedOrCancel =
      body.type === "reschedule" || body.type === "cancellation" || body.type === "modification";

    if (!isReschedOrCancel && !isDeferredBilling && !isPaymentEngaged) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Confirmation email blocked: client_type=${bookingClientType ?? "null"} / payment_method=${bookingPaymentMethod ?? "null"} requires payment_status to be paid/authorized/engaged (got ${bookingPaymentStatus ?? "null"}). Use the Stripe payment link flow instead.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { data: treatments } = await supabase
      .from("booking_treatments")
      .select("price_override, treatment_menus(name, price), treatment_variants(price)")
      .eq("booking_id", bookingId);

    const treatmentList: BookingTreatment[] = (treatments ?? []).map((row: any) => ({
      name: row.treatment_menus?.name ?? null,
      price: resolveTreatmentPrice(row),
    }));

    const hotel = (booking as any).hotels as { name?: string; currency?: string } | null;
    const hotelName = hotel?.name ?? "";
    const currency = hotel?.currency ?? "EUR";
    const clientName = `${booking.client_first_name ?? ""} ${booking.client_last_name ?? ""}`.trim();
    const dateLong = formatLongDate(booking.booking_date, language);

    const errors: string[] = [];
    let emailSent = false;
    let smsSent = false;

    if (channels.includes("email")) {
      const to = body.clientEmail ?? booking.client_email;
      if (!to) {
        errors.push("No email address for recipient");
      } else {
        const html = buildEmailHtml({
          clientName,
          hotelName,
          bookingId: booking.booking_id,
          dateLong,
          bookingTime: booking.booking_time.substring(0, 5),
          roomNumber: booking.room_number ?? null,
          treatments: treatmentList,
          totalPrice: Number(booking.total_price ?? 0),
          currency,
          language,
          isDeferredBilling,
          isModification: body.type === "modification",
          isPending: booking.status === "pending",
        });
        const subject = body.type === "modification"
          ? (language === "fr"
            ? `Modification de votre réservation #${booking.booking_id}`
            : `Your booking #${booking.booking_id} has been updated`)
          : (language === "fr"
            ? `Confirmation de votre réservation #${booking.booking_id}`
            : `Your booking confirmation #${booking.booking_id}`);
        const result = await sendEmail({
          to,
          subject,
          html,
          audit: {
            bookingId,
            emailType: body.type === "modification" ? 'booking_modified' : 'booking_notification',
            metadata: { booking_number: booking.booking_id },
          },
        });
        if (result.error) {
          errors.push(`Email: ${result.error}`);
        } else {
          emailSent = true;
        }
      }
    }

    if (channels.includes("sms")) {
      const to = body.clientPhone ?? booking.phone;
      console.log("[send-booking-notification] SMS channel", {
        to,
        fromBody: !!body.clientPhone,
        fromBooking: !body.clientPhone && !!booking.phone,
      });
      if (!to) {
        console.warn("[send-booking-notification] No phone number available");
        errors.push("No phone number for recipient");
      } else {
        const siteUrl = Deno.env.get("SITE_URL") ?? "https://lymfea.fr";
        // Lien court /m/<token> : l'URL en UUID pesait à elle seule ~55
        // caractères, soit un tiers d'un segment SMS.
        const shortToken = (booking as any).short_token;
        const manageUrl = shortToken
          ? `${siteUrl}/m/${shortToken}`
          : `${siteUrl}/booking/manage/${booking.id}`;
        const rebookUrl = `${siteUrl}/client/${(booking as any).hotel_id}/treatments`;
        const smsBody = buildSmsBody({
          clientName,
          hotelName,
          // Déplacement et modification se contentent d'une date compacte (un
          // seul segment SMS) ; les autres gardent la date longue, déjà validée
          // côté produit.
          dateLong: body.type === "reschedule" || body.type === "modification"
            ? formatShortDate(booking.booking_date, language)
            : dateLong,
          bookingTime: booking.booking_time.substring(0, 5),
          roomNumber: booking.room_number ?? null,
          isRoomCharged: isRoomChargedBooking(bookingClientType, {
            paymentMethod: bookingPaymentMethod,
            paymentStatus: bookingPaymentStatus,
          }),
          manageUrl,
          rebookUrl,
          language,
          type: body.type ?? "confirmation",
          isPending: booking.status === "pending",
        });
        console.log("[send-booking-notification] Calling sendSms", { to, bodyLength: smsBody.length });
        const result = await sendSms({ to, body: smsBody });
        console.log("[send-booking-notification] sendSms result", result);
        if (result.error) {
          errors.push(`SMS: ${result.error}`);
        } else {
          smsSent = true;
        }
      }
    }

    console.log("[send-booking-notification] Done", { emailSent, smsSent, errors });

    return new Response(
      JSON.stringify({
        success: emailSent || smsSent,
        emailSent,
        smsSent,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: emailSent || smsSent ? 200 : 500,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-booking-notification] error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
