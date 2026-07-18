import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendEmail } from "../_shared/send-email.ts";
import { sendSms } from "../_shared/send-sms.ts";
import { brand } from "../_shared/brand.ts";
import {
  buildCancelledVars,
  type BookingEmailContext,
  type CancelledExtras,
  currencySymbol,
  type EmailVenue,
} from "../_shared/booking-email-vars.ts";
import {
  getBookingCancelledAdminHtml,
  getBookingCancelledHtml,
} from "../_shared/templates/booking-cancelled.ts";
import {
  type CancelLang,
  getCancelMessages,
  resolveCancelLang,
  shouldSendCancellationSms,
} from "./i18n.ts";

interface CancelNotificationContext {
  supabase: SupabaseClient;
  booking: Record<string, unknown>;
  venue?: EmailVenue | null;
  paymentInfo: {
    card_brand?: string | null;
    card_last4?: string | null;
  } | null;
  reason?: string;
  totalPrice: number;
  depositAmount: number;
  feeApplied: number;
  refundAmount: number;
  needsStripe: boolean;
  isPartnerBilled: boolean;
  isChargedToRoom: boolean;
  resolvedBookingId: string;
}

export async function sendCancellationNotifications(ctx: CancelNotificationContext): Promise<void> {
  const {
    supabase,
    booking,
    venue,
    paymentInfo,
    reason,
    totalPrice,
    depositAmount,
    feeApplied,
    refundAmount,
    needsStripe,
    isPartnerBilled,
    isChargedToRoom,
    resolvedBookingId,
  } = ctx;

  try {
    await supabase.functions.invoke("handle-booking-cancellation", {
      body: { bookingId: resolvedBookingId, cancellationReason: reason },
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    });
  } catch (e) {
    console.error("[cancel-booking] handle-booking-cancellation error:", e);
  }

  const lang = resolveCancelLang(booking.language as string | null);
  const msg = getCancelMessages(lang);
  const dateLocale = lang === "en" ? "en-GB" : "fr-FR";
  const formattedDate = new Date(String(booking.booking_date)).toLocaleDateString(dateLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const formattedTime = String(booking.booking_time ?? "").substring(0, 5);
  const siteUrl = Deno.env.get("SITE_URL") || `https://${brand.appDomain}`;
  const clientName = `${booking.client_first_name ?? ""} ${booking.client_last_name ?? ""}`.trim();
  const sym = currencySymbol(venue?.currency);
  const cardLine = paymentInfo?.card_brand && paymentInfo?.card_last4
    ? `${paymentInfo.card_brand.toUpperCase()} ••••${paymentInfo.card_last4}`
    : null;

  // Normalized email context reused for the client (its own language) and the
  // admin recap (always FR). Treatments aren't needed by the cancelled layout.
  const makeCtx = (l: CancelLang): BookingEmailContext => ({
    booking: {
      booking_id: booking.booking_id as number | string | null | undefined,
      client_first_name: booking.client_first_name as string | null | undefined,
      client_last_name: booking.client_last_name as string | null | undefined,
      phone: booking.phone as string | null | undefined,
      room_number: booking.room_number as number | string | null | undefined,
      total_price: totalPrice,
      hotel_name: booking.hotel_name as string | null | undefined,
      booking_date: String(booking.booking_date),
      booking_time: booking.booking_time as string | null | undefined,
    },
    venue: venue ?? null,
    civility: (booking.civility as string | null | undefined) ?? null,
    lang: l,
    treatments: [],
    contactEmail: venue?.contact_email ?? null,
  });

  // Cancellation / refund summary rows. Branching (refund vs partner-billed vs
  // room-charge vs no-refund) mirrors the payment logic; the design layer only
  // renders it. Copy comes from i18n so client (lang) and admin (FR) match.
  const buildExtras = (m: ReturnType<typeof getCancelMessages>, l: CancelLang): CancelledExtras => {
    const paymentLabel = l === "en" ? "Payment" : "Paiement";
    const rows: Array<[string, string]> = [[m.totalBooking, `${totalPrice} ${sym}`]];
    let refund: { label: string; value: string } | null = null;

    if (isPartnerBilled) {
      rows.push([paymentLabel, m.partnerPayment]);
    } else if (isChargedToRoom) {
      rows.push([paymentLabel, m.roomChargePayment]);
    } else if (needsStripe) {
      rows.push([
        m.depositPaid,
        cardLine ? `${cardLine} — ${depositAmount} ${sym}` : `${depositAmount} ${sym}`,
      ]);
      if (feeApplied > 0) rows.push([m.cancellationFee, `${feeApplied} ${sym}`]);
      refund = { label: m.refunded, value: `${refundAmount} ${sym}` };
    } else {
      rows.push([paymentLabel, m.noRefundPayment]);
    }

    return {
      detailsTitle: needsStripe ? m.detailsRefund : m.detailsCancellation,
      rows,
      refund,
      reason: reason ? { label: m.reason, value: reason } : null,
      clientRow: { label: m.clientLabel, value: clientName },
      roomRow: booking.room_number
        ? { label: m.roomLabel, value: String(booking.room_number) }
        : null,
      rebookUrl: siteUrl,
    };
  };

  if (booking.client_email) {
    try {
      await sendEmail({
        to: String(booking.client_email),
        subject: msg.emailSubject(formattedDate),
        html: getBookingCancelledHtml(lang, buildCancelledVars(makeCtx(lang), buildExtras(msg, lang))),
        audit: { bookingId: resolvedBookingId, emailType: 'booking_cancelled', metadata: { booking_number: booking.booking_id } },
      });
    } catch (emailErr) {
      console.error("[cancel-booking] Client email error:", emailErr);
    }
  }

  try {
    const { data: adminUsers } = await supabase
      .from("admins")
      .select("email")
      .eq("status", "Actif");

    const adminEmails = (adminUsers ?? [])
      .map((a: { email?: string }) => a.email)
      .filter((e): e is string => !!e);

    if (adminEmails.length > 0) {
      const msgFr = getCancelMessages("fr");
      const adminHtml = getBookingCancelledAdminHtml(
        buildCancelledVars(makeCtx("fr"), buildExtras(msgFr, "fr")),
      );

      await Promise.all(
        adminEmails.map((to) =>
          sendEmail({
            to,
            subject: msg.adminEmailSubject(booking.booking_id as number),
            html: adminHtml,
          }).catch((err) => console.error("[cancel-booking] Admin email error:", to, err)),
        ),
      );
    }
  } catch (adminEmailErr) {
    console.error("[cancel-booking] Admin recap email error:", adminEmailErr);
  }

  const clientPhone = String(booking.phone ?? "");
  if (
    clientPhone &&
    shouldSendCancellationSms({
      payment_status: booking.payment_status as string | null,
      status: booking.status as string | null,
    })
  ) {
    try {
      const refundSuffix = needsStripe && refundAmount > 0
        ? (lang === "en" ? ` Refund: €${refundAmount}.` : ` Remboursement : ${refundAmount}€.`)
        : "";
      const smsResult = await sendSms({
        to: clientPhone,
        body: msg.smsCancelled({
          firstName: String(booking.client_first_name ?? ""),
          hotelName: String(booking.hotel_name ?? ""),
          date: formattedDate,
          time: formattedTime,
          refundSuffix,
        }),
      });
      if (smsResult.error) {
        console.error("[cancel-booking] SMS error:", smsResult.error);
      }
    } catch (smsErr) {
      console.error("[cancel-booking] SMS exception:", smsErr);
    }
  } else {
    console.log("[cancel-booking] SMS skipped", {
      hasPhone: !!clientPhone,
      payment_status: booking.payment_status,
      status: booking.status,
    });
  }
}
