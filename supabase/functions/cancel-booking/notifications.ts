import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "../_shared/send-email.ts";
import { sendSms } from "../_shared/send-sms.ts";
import { brand } from "../_shared/brand.ts";
import {
  getBaseEmailTemplate,
  getEmailHeader,
  getInfoRow,
  getDateTimeHighlight,
} from "../_shared/email-template.ts";
import { getCancelMessages, resolveCancelLang, shouldSendCancellationSms } from "./i18n.ts";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeInfoRow(label: string, value: unknown): string {
  return getInfoRow(escapeHtml(label), escapeHtml(value));
}

interface CancelNotificationContext {
  supabase: SupabaseClient;
  booking: Record<string, unknown>;
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
  const cardLine = paymentInfo?.card_brand && paymentInfo?.card_last4
    ? `${paymentInfo.card_brand.toUpperCase()} ••••${paymentInfo.card_last4}`
    : null;

  if (booking.client_email) {
    try {
      let paymentDetailsBlock: string;
      if (isPartnerBilled) {
        paymentDetailsBlock = buildDetailsBlock(msg.detailsCancellation, [
          [msg.totalBooking, `${totalPrice}€`],
          ["Paiement", msg.partnerPayment],
          ...(reason ? [[msg.reason, reason]] : []),
        ]);
      } else if (isChargedToRoom) {
        paymentDetailsBlock = buildDetailsBlock(msg.detailsCancellation, [
          [msg.totalBooking, `${totalPrice}€`],
          ["Paiement", msg.roomChargePayment],
          ...(reason ? [[msg.reason, reason]] : []),
        ]);
      } else if (needsStripe) {
        paymentDetailsBlock = buildDetailsBlock(msg.detailsRefund, [
          [msg.totalBooking, `${totalPrice}€`],
          [msg.depositPaid, cardLine ? `${cardLine} — ${depositAmount}€` : `${depositAmount}€`],
          ...(feeApplied > 0 ? [[msg.cancellationFee, `${feeApplied}€`]] : []),
          [msg.refunded, `${refundAmount}€`],
          ...(reason ? [[msg.reason, reason]] : []),
        ]);
      } else {
        paymentDetailsBlock = buildDetailsBlock(msg.detailsCancellation, [
          [msg.totalBooking, `${totalPrice}€`],
          ["Paiement", msg.noRefundPayment],
          ...(reason ? [[msg.reason, reason]] : []),
        ]);
      }

      const emailContent = `
        ${getEmailHeader(msg.emailHeader, msg.emailBadge, "#ef4444")}
        <tr>
          <td style="padding: 24px 30px 0;">
            ${getDateTimeHighlight(formattedDate, formattedTime)}
            <table width="100%" cellpadding="0" cellspacing="0">
              ${safeInfoRow(msg.clientLabel, clientName)}
              ${safeInfoRow(msg.venueLabel, String(booking.hotel_name ?? ""))}
              ${booking.room_number ? safeInfoRow(msg.roomLabel, String(booking.room_number)) : ""}
            </table>
          </td>
        </tr>
        <tr><td style="padding: 24px 30px 0;">${paymentDetailsBlock}</td></tr>
      `;

      await sendEmail({
        to: String(booking.client_email),
        subject: msg.emailSubject(formattedDate),
        html: getBaseEmailTemplate(emailContent, {
          showButton: !!siteUrl,
          buttonText: msg.emailButton,
          buttonUrl: siteUrl,
        }),
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
      const adminHtml = getBaseEmailTemplate(
        `
        ${getEmailHeader(msg.adminEmailTitle, msg.emailBadge, "#ef4444")}
        <tr><td style="padding: 24px 30px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${safeInfoRow(msg.clientLabel, clientName)}
            ${safeInfoRow(msg.venueLabel, String(booking.hotel_name ?? ""))}
            ${getDateTimeHighlight(formattedDate, formattedTime)}
            ${safeInfoRow(msg.totalBooking, `${totalPrice}€`)}
            ${needsStripe && refundAmount > 0 ? safeInfoRow(msg.adminRefund, `${refundAmount}€`) : ""}
            ${feeApplied > 0 ? safeInfoRow(msg.adminFee, `${feeApplied}€`) : ""}
            ${reason ? safeInfoRow(msg.adminReason, reason) : ""}
          </table>
        </td></tr>
      `,
        { showButton: false },
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

function buildDetailsBlock(title: string, rows: string[][]): string {
  const rowHtml = rows.map(([label, value]) => safeInfoRow(label, value)).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 12px; margin-bottom: 24px;">
      <tr><td style="padding: 20px;">
        <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #374151;">${escapeHtml(title)}</p>
        ${rowHtml}
      </td></tr>
    </table>`;
}
