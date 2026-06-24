import { brand } from "../../_shared/brand.ts";
import { computeTherapistEarnings } from "../../_shared/therapistEarnings.ts";
import { getStripeForVenue } from "../../_shared/stripe-resolver.ts";
import type { ActionContext } from "../index.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const log = (message: string, data?: unknown) => {
  console.log(
    `[finalize-payment] ${message}`,
    data ? JSON.stringify(data, null, 2) : "",
  );
};

interface FinalizePaymentBody {
  booking_id: string;
  payment_method: "card" | "room";
  final_amount: number;
  signature_data?: string;
}

interface CommissionBreakdown {
  totalTTC: number;
  totalHT: number;
  tvaAmount: number;
  tvaRate: number;
  hotelCommission: number;
  hotelCommissionRate: number;
  therapistShare: number;
  therapistCommissionRate: number;
  lymfeaShare: number;
}

async function uploadSignatureToStorage(
  supabase: SupabaseClient,
  bookingId: string,
  signatureBase64: string,
): Promise<string | null> {
  try {
    const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, "");
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const fileName = `booking_${bookingId}_${Date.now()}.png`;
    const { error } = await supabase.storage
      .from("signatures")
      .upload(fileName, bytes, { contentType: "image/png", upsert: true });
    if (error) {
      log("Error uploading signature", { error: error.message });
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("signatures")
      .getPublicUrl(fileName);
    return publicUrlData.publicUrl;
  } catch (err) {
    log("Exception uploading signature", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function handleFinalizePayment(
  ctx: ActionContext,
): Promise<Response> {
  const { body, supabase, stripe: defaultStripe } = ctx;

  try {
    const { booking_id, payment_method, final_amount, signature_data } =
      body as FinalizePaymentBody;

    log("Request received", {
      booking_id,
      payment_method,
      final_amount,
      hasSignature: !!signature_data,
    });

    if (!booking_id || !payment_method || !final_amount) {
      throw new Error(
        "Missing required fields: booking_id, payment_method, final_amount",
      );
    }
    if (payment_method === "room" && !signature_data) {
      throw new Error("Signature is required for room payment method");
    }
    if (final_amount <= 0) {
      throw new Error("Final amount must be positive");
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `
        id,
        booking_id,
        hotel_id,
        therapist_id,
        client_email,
        client_first_name,
        client_last_name,
        room_number,
        customer_id,
        customers(email, first_name, last_name),
        booking_treatments(
          treatment_id,
          treatment_menus(name, price, duration)
        ),
        hotels(
          name,
          vat,
          hotel_commission,
          currency,
          venue_type
        ),
        therapists(
          first_name,
          last_name,
          stripe_account_id,
          rate_60,
          rate_75,
          rate_90
        )
      `,
      )
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Booking not found: ${booking_id}`);
    }

    const hotel = booking.hotels;
    const therapist = booking.therapists;
    if (!hotel) throw new Error(`Hotel not found for booking: ${booking_id}`);

    // Resolve venue Stripe based on the booking's hotel_id
    let stripe = defaultStripe;
    if (booking.hotel_id) {
      const resolved = await getStripeForVenue(supabase, booking.hotel_id);
      stripe = resolved.client;
    }

    if (payment_method === "room" && hotel.venue_type === "coworking") {
      throw new Error("Room payment is not available for coworking spaces");
    }

    const currency = (hotel.currency || "EUR").toLowerCase();
    const vatRate = hotel.vat || 20;
    const hotelCommissionRate = hotel.hotel_commission || 10;
    const totalTTC = final_amount;
    const totalHT = totalTTC / (1 + vatRate / 100);
    const tvaAmount = totalTTC - totalHT;
    const hotelCommission = totalHT * (hotelCommissionRate / 100);

    const bookingDuration = (booking.booking_treatments || []).reduce(
      (sum: number, bt: { treatment_menus?: { duration?: number } }) =>
        sum + (bt.treatment_menus?.duration || 0),
      0,
    );

    const earned = therapist
      ? computeTherapistEarnings(
          {
            rate_60: therapist.rate_60 ?? null,
            rate_75: therapist.rate_75 ?? null,
            rate_90: therapist.rate_90 ?? null,
          },
          bookingDuration,
        )
      : null;

    if (earned == null) {
      throw new Error(
        `Tarifs thérapeute incomplets ou durée invalide pour le booking ${booking_id}`,
      );
    }

    const therapistShare = Math.min(earned, totalHT - hotelCommission);
    const lymfeaShare = totalHT - hotelCommission - therapistShare;

    const breakdown: CommissionBreakdown = {
      totalTTC,
      totalHT: Math.round(totalHT * 100) / 100,
      tvaAmount: Math.round(tvaAmount * 100) / 100,
      tvaRate: vatRate,
      hotelCommission: Math.round(hotelCommission * 100) / 100,
      hotelCommissionRate,
      therapistShare: Math.round(therapistShare * 100) / 100,
      therapistCommissionRate: 0,
      lymfeaShare: Math.round(lymfeaShare * 100) / 100,
    };

    let result: Record<string, unknown> = { breakdown };

    let signaturePublicUrl: string | null = null;
    if (signature_data) {
      signaturePublicUrl = await uploadSignatureToStorage(
        supabase,
        booking.id,
        signature_data,
      );
    }

    if (payment_method === "card") {
      const treatmentNames =
        booking.booking_treatments
          ?.map((bt: { treatment_menus?: { name?: string } }) =>
            bt.treatment_menus?.name,
          )
          .filter(Boolean)
          .join(", ") || `Prestation ${brand.name}`;

      const siteUrl = Deno.env.get("SITE_URL") || brand.website;

      const paymentLink = await stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `Prestations bien-être ${brand.name}`,
                description: treatmentNames,
              },
              unit_amount: Math.round(totalTTC * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          booking_id: booking.id,
          booking_number: booking.booking_id.toString(),
          hotel_id: booking.hotel_id,
          therapist_id: booking.therapist_id || "",
          therapist_share: breakdown.therapistShare.toString(),
          hotel_commission: breakdown.hotelCommission.toString(),
          lymfea_share: breakdown.lymfeaShare.toString(),
          total_ht: breakdown.totalHT.toString(),
          source: "finalize-payment",
        },
        after_completion: {
          type: "redirect",
          redirect: {
            url: `${siteUrl}/client/${booking.hotel_id}/confirmation/${booking.id}?payment=success`,
          },
        },
      });

      await supabase
        .from("bookings")
        .update({
          payment_method: "card",
          payment_status: "pending",
          total_price: totalTTC,
          payment_link_url: paymentLink.url,
          client_signature: signature_data || null,
          signed_at: signature_data ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking_id);

      result = {
        ...result,
        success: true,
        payment_method: "card",
        payment_url: paymentLink.url,
        message: "Payment Link created. Send to client via WhatsApp or email.",
      };
    } else {
      const clientEmail = booking.client_email || booking.customers?.email;
      if (!clientEmail) {
        throw new Error(
          "L'email du client est requis pour le paiement sur chambre (génération de facture)",
        );
      }
      if (!signature_data) {
        throw new Error("Signature is required for room payment");
      }

      let customerId: string | undefined;
      const customers = await stripe.customers.list({
        email: clientEmail,
        limit: 1,
      });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: clientEmail,
          name: `${booking.client_first_name} ${booking.client_last_name}`,
          metadata: {
            booking_id: booking.id,
            hotel_id: booking.hotel_id,
          },
        });
        customerId = customer.id;
      }

      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: 0,
        auto_advance: false,
        metadata: {
          booking_id: booking.id,
          booking_number: booking.booking_id.toString(),
          hotel_id: booking.hotel_id,
          therapist_id: booking.therapist_id || "",
          payment_method: "room",
          signature_url: signaturePublicUrl || "",
        },
        custom_fields: [
          { name: "Chambre", value: booking.room_number || "N/A" },
          {
            name: "Signature",
            value: signaturePublicUrl ? "✓ Validée" : "N/A",
          },
        ],
        footer: `Paiement mis sur la note de chambre ${booking.room_number || ""}. Document de prestation signé par le client.`,
      });

      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: Math.round(totalTTC * 100),
        currency,
        description: `Prestation ${brand.name} - Réservation #${booking.booking_id} - ${hotel.name} - Chambre ${booking.room_number || "N/A"}`,
      });

      await stripe.invoices.finalizeInvoice(invoice.id);
      const paidInvoice = await stripe.invoices.pay(invoice.id, {
        paid_out_of_band: true,
      });

      await supabase
        .from("bookings")
        .update({
          client_signature: signature_data,
          stripe_invoice_url: paidInvoice.hosted_invoice_url,
          payment_method: "room",
          total_price: totalTTC,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking_id);

      // Cash advance to therapist (Connect transfer) — only if a Connect account is set
      let transferResult: Record<string, unknown> | null = null;
      if (therapist?.stripe_account_id && breakdown.therapistShare > 0) {
        try {
          const transfer = await stripe.transfers.create({
            amount: Math.round(breakdown.therapistShare * 100),
            currency,
            destination: therapist.stripe_account_id,
            transfer_group: `booking_${booking.booking_id}`,
            metadata: {
              booking_id: booking.id,
              booking_number: booking.booking_id.toString(),
              type: "cash_advance",
              payment_method: "room",
            },
          });

          await supabase.from("therapist_payouts").insert({
            therapist_id: booking.therapist_id,
            booking_id: booking.id,
            amount: breakdown.therapistShare,
            stripe_transfer_id: transfer.id,
            status: "completed",
          });

          transferResult = {
            success: true,
            transfer_id: transfer.id,
            amount: breakdown.therapistShare,
          };
        } catch (transferError) {
          const tMsg =
            transferError instanceof Error
              ? transferError.message
              : String(transferError);
          await supabase.from("therapist_payouts").insert({
            therapist_id: booking.therapist_id,
            booking_id: booking.id,
            amount: breakdown.therapistShare,
            status: "failed",
            error_message: tMsg,
          });
          transferResult = { success: false, error: tMsg };
        }
      } else {
        transferResult = {
          success: false,
          error: therapist?.stripe_account_id
            ? "Therapist share is zero"
            : "Therapist has no Stripe account connected",
        };
      }

      const hotelCommissionTTC = breakdown.hotelCommission * (1 + vatRate / 100);
      const ledgerAmount = totalTTC - hotelCommissionTTC;

      await supabase.from("hotel_ledger").insert({
        hotel_id: booking.hotel_id,
        booking_id: booking.id,
        amount: ledgerAmount,
        status: "pending",
        description: `Réservation #${booking.booking_id} - ${booking.client_first_name} ${booking.client_last_name} - Chambre ${booking.room_number || "N/A"}`,
      });

      await supabase
        .from("bookings")
        .update({
          status: "Terminé",
          payment_status: "paid",
          signed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking_id);

      try {
        await supabase.functions.invoke("notify-concierge-completion", {
          body: { bookingId: booking.id },
        });
      } catch (e) {
        log("Failed to notify concierge", {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      result = {
        ...result,
        success: true,
        payment_method: "room",
        transfer: transferResult,
        ledger_amount: ledgerAmount,
        invoice_url: paidInvoice.hosted_invoice_url,
        invoice_pdf: paidInvoice.invoice_pdf,
        message:
          "Room payment finalized. Stripe Invoice created. Therapist paid (cash advance). Concierge notified.",
      };
    }

    return jsonResponse(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("Error", { message: msg });
    return jsonResponse({ success: false, error: msg }, 500);
  }
}
