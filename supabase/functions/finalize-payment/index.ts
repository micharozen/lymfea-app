import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const log = (message: string, data?: any) => {
  console.log(`[finalize-payment] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

interface FinalizePaymentRequest {
  booking_id: string;
  payment_method: 'card' | 'room';
  final_amount: number;
  signature_data?: string; // Base64 de la signature (requis pour 'room')
}

interface CommissionBreakdown {
  totalTTC: number;
  totalHT: number;
  tvaAmount: number;
  tvaRate: number;
  hotelCommission: number;
  hotelCommissionRate: number;
  hairdresserShare: number;
  hairdresserCommissionRate: number;
  oomShare: number;
}

// Upload signature to Supabase Storage and return public URL
async function uploadSignatureToStorage(
  supabase: any,
  bookingId: string,
  signatureBase64: string
): Promise<string | null> {
  try {
    // Extract base64 data
    const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, '');
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const fileName = `booking_${bookingId}_${Date.now()}.png`;
    
    const { data, error } = await supabase.storage
      .from('signatures')
      .upload(fileName, bytes, {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) {
      log("Error uploading signature", { error: error.message });
      return null;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('signatures')
      .getPublicUrl(fileName);

    log("Signature uploaded", { publicUrl: publicUrlData.publicUrl });
    return publicUrlData.publicUrl;
  } catch (err: any) {
    log("Exception uploading signature", { error: err.message });
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { booking_id, payment_method, final_amount, signature_data }: FinalizePaymentRequest = await req.json();

    log("Request received", { booking_id, payment_method, final_amount, hasSignature: !!signature_data });

    // Validation des inputs
    if (!booking_id || !payment_method || !final_amount) {
      throw new Error("Missing required fields: booking_id, payment_method, final_amount");
    }

    if (payment_method === 'room' && !signature_data) {
      throw new Error("Signature is required for room payment method");
    }

    if (final_amount <= 0) {
      throw new Error("Final amount must be positive");
    }

    // Initialiser Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Initialiser Supabase avec service role pour les opérations admin
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Récupérer le booking avec toutes les relations nécessaires en une seule requête
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_id,
        hotel_id,
        hairdresser_id,
        client_email,
        client_first_name,
        client_last_name,
        room_number,
        booking_treatments(
          treatment_id,
          treatment_menus(name, price)
        ),
        hotels(
          name,
          vat,
          hotel_commission,
          hairdresser_commission,
          currency,
          venue_type
        ),
        hairdressers(
          first_name,
          last_name,
          stripe_account_id
        )
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      log("Booking not found", { bookingError });
      throw new Error(`Booking not found: ${booking_id}`);
    }

    const hotel = booking.hotels;
    const hairdresser = booking.hairdressers;

    if (!hotel) {
      log("Hotel not found in booking relation");
      throw new Error(`Hotel not found for booking: ${booking_id}`);
    }

    log("Booking found", {
      booking_id: booking.booking_id,
      hotel_id: booking.hotel_id,
      hotel_name: hotel.name,
      hairdresser: hairdresser ? `${hairdresser.first_name} ${hairdresser.last_name}` : 'none'
    });

    // Coworking spaces don't support room payment
    if (payment_method === 'room' && hotel.venue_type === 'coworking') {
      throw new Error("Room payment is not available for coworking spaces");
    }

    // Get currency for Stripe operations (lowercase)
    const currency = (hotel.currency || 'EUR').toLowerCase();

    // 4. Calculer les commissions
    const vatRate = hotel.vat || 20;
    const hotelCommissionRate = hotel.hotel_commission || 10;
    const hairdresserCommissionRate = hotel.hairdresser_commission || 70;

    const totalTTC = final_amount;
    const totalHT = totalTTC / (1 + vatRate / 100);
    const tvaAmount = totalTTC - totalHT;

    // Commissions calculées sur le HT
    const hotelCommission = totalHT * (hotelCommissionRate / 100);
    const hairdresserShare = totalHT * (hairdresserCommissionRate / 100);
    const oomShare = totalHT - hotelCommission - hairdresserShare;

    const breakdown: CommissionBreakdown = {
      totalTTC,
      totalHT: Math.round(totalHT * 100) / 100,
      tvaAmount: Math.round(tvaAmount * 100) / 100,
      tvaRate: vatRate,
      hotelCommission: Math.round(hotelCommission * 100) / 100,
      hotelCommissionRate,
      hairdresserShare: Math.round(hairdresserShare * 100) / 100,
      hairdresserCommissionRate,
      oomShare: Math.round(oomShare * 100) / 100,
    };

    log("Commission breakdown", breakdown);

    let result: any = { breakdown };

    // Upload signature if provided
    let signaturePublicUrl: string | null = null;
    if (signature_data) {
      signaturePublicUrl = await uploadSignatureToStorage(supabase, booking.id, signature_data);
    }

    // 5. Traitement selon le mode de paiement
    if (payment_method === 'card') {
      // ===== PAIEMENT CARTE =====
      log("Processing CARD payment with Payment Link");

      // Build description with treatments
      const treatmentNames = booking.booking_treatments
        ?.map((bt: any) => bt.treatment_menus?.name)
        .filter(Boolean)
        .join(', ') || 'Prestation OOM';

      const siteUrl = Deno.env.get("SITE_URL") || "https://oomworld.com";

      // Create Stripe Payment Link (no customer/email required)
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{
          price_data: {
            currency: currency,
            product_data: {
              name: 'Prestations bien-être OOM World',
              description: treatmentNames,
            },
            unit_amount: Math.round(totalTTC * 100),
          },
          quantity: 1,
        }],
        metadata: {
          booking_id: booking.id,
          booking_number: booking.booking_id.toString(),
          hotel_id: booking.hotel_id,
          hairdresser_id: booking.hairdresser_id || '',
          hairdresser_share: breakdown.hairdresserShare.toString(),
          hotel_commission: breakdown.hotelCommission.toString(),
          oom_share: breakdown.oomShare.toString(),
          total_ht: breakdown.totalHT.toString(),
          source: 'finalize-payment',
        },
        after_completion: {
          type: 'redirect',
          redirect: {
            url: `${siteUrl}/booking/confirmation/${booking.id}?payment=success`,
          },
        },
      });

      log("Payment Link created", { url: paymentLink.url });

      // Update booking with payment link URL and pending status
      await supabase
        .from('bookings')
        .update({
          payment_method: 'card',
          payment_status: 'pending',
          total_price: totalTTC,
          payment_link_url: paymentLink.url,
          client_signature: signature_data || null,
          signed_at: signature_data ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking_id);

      result = {
        ...result,
        success: true,
        payment_method: 'card',
        payment_url: paymentLink.url,
        message: "Payment Link created. Send to client via WhatsApp or email.",
      };

    } else {
      // ===== PAIEMENT CHAMBRE =====
      log("Processing ROOM payment");

      // Room payment requires email for invoice generation
      if (!booking.client_email) {
        throw new Error("L'email du client est requis pour le paiement sur chambre (génération de facture)");
      }

      // Vérifier que la signature est présente
      if (!signature_data) {
        throw new Error("Signature is required for room payment");
      }

      // Create or find Stripe customer for room payment (for invoice generation)
      const clientEmail = booking.client_email;
      let customerId: string | undefined;

      const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: clientEmail,
          name: `${booking.client_first_name} ${booking.client_last_name}`,
          metadata: { booking_id: booking.id, hotel_id: booking.hotel_id },
        });
        customerId = customer.id;
      }

      // Create Stripe Invoice for room payment (marked as paid outside Stripe)
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: 0,
        auto_advance: false, // Don't auto-advance for room payments
        metadata: {
          booking_id: booking.id,
          booking_number: booking.booking_id.toString(),
          hotel_id: booking.hotel_id,
          hairdresser_id: booking.hairdresser_id || '',
          payment_method: 'room',
          signature_url: signaturePublicUrl || '',
        },
        custom_fields: [
          {
            name: 'Chambre',
            value: booking.room_number || 'N/A',
          },
          {
            name: 'Signature',
            value: signaturePublicUrl ? '✓ Validée' : 'N/A',
          },
        ],
        footer: `Paiement mis sur la note de chambre ${booking.room_number || ''}. Document de prestation signé par le client.`,
      });

      // Add invoice line item
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: Math.round(totalTTC * 100),
        currency: currency,
        description: `Prestation OOM - Réservation #${booking.booking_id} - ${hotel.name} - Chambre ${booking.room_number || 'N/A'}`,
      });

      // Finalize the invoice
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
      
      // Mark as paid (outside of Stripe, since hotel collects)
      const paidInvoice = await stripe.invoices.pay(invoice.id, {
        paid_out_of_band: true,
      });

      log("Room invoice created and marked as paid", { 
        invoiceId: paidInvoice.id, 
        hosted_invoice_url: paidInvoice.hosted_invoice_url 
      });

      // Sauvegarder la signature et l'URL de facture dans le booking
      await supabase
        .from('bookings')
        .update({
          client_signature: signature_data,
          stripe_invoice_url: paidInvoice.hosted_invoice_url,
          payment_method: 'room',
          total_price: totalTTC,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking_id);

      // Cash Advance: Transférer immédiatement au coiffeur
      let transferResult = null;
      if (hairdresser?.stripe_account_id && breakdown.hairdresserShare > 0) {
        try {
          log("Initiating cash advance transfer to hairdresser", {
            amount: breakdown.hairdresserShare,
            destination: hairdresser.stripe_account_id,
          });

          const transfer = await stripe.transfers.create({
            amount: Math.round(breakdown.hairdresserShare * 100), // En centimes
            currency: currency,
            destination: hairdresser.stripe_account_id,
            transfer_group: `booking_${booking.booking_id}`,
            metadata: {
              booking_id: booking.id,
              booking_number: booking.booking_id.toString(),
              type: 'cash_advance',
              payment_method: 'room',
            },
          });

          log("Transfer successful", { transfer_id: transfer.id });

          // Enregistrer le payout
          await supabase
            .from('hairdresser_payouts')
            .insert({
              hairdresser_id: booking.hairdresser_id,
              booking_id: booking.id,
              amount: breakdown.hairdresserShare,
              stripe_transfer_id: transfer.id,
              status: 'completed',
            });

          transferResult = {
            success: true,
            transfer_id: transfer.id,
            amount: breakdown.hairdresserShare,
          };
        } catch (transferError: any) {
          log("Transfer failed", { error: transferError.message });
          
          // Enregistrer l'échec
          await supabase
            .from('hairdresser_payouts')
            .insert({
              hairdresser_id: booking.hairdresser_id,
              booking_id: booking.id,
              amount: breakdown.hairdresserShare,
              status: 'failed',
              error_message: transferError.message,
            });

          transferResult = {
            success: false,
            error: transferError.message,
          };
        }
      } else {
        log("No hairdresser Stripe account or zero share, skipping transfer");
        transferResult = {
          success: false,
          error: hairdresser?.stripe_account_id 
            ? "Hairdresser share is zero" 
            : "Hairdresser has no Stripe account connected",
        };
      }

      // Ajouter au Ledger (Hôtel doit à OOM)
      // Formula: ledgerDebt = total - (baseHT * hotelCommissionRate * (1 + vatRate))
      // This ensures hotel keeps its commission TTC, rest goes to OOM
      const hotelCommissionTTC = breakdown.hotelCommission * (1 + vatRate / 100);
      const ledgerAmount = totalTTC - hotelCommissionTTC;
      
      await supabase
        .from('hotel_ledger')
        .insert({
          hotel_id: booking.hotel_id,
          booking_id: booking.id,
          amount: ledgerAmount, // Positif = dette de l'hôtel
          status: 'pending',
          description: `Réservation #${booking.booking_id} - ${booking.client_first_name} ${booking.client_last_name} - Chambre ${booking.room_number || 'N/A'}`,
        });

      log("Ledger entry created", { amount: ledgerAmount });

      // Mettre à jour le statut du booking
      await supabase
        .from('bookings')
        .update({
          status: 'Terminé',
          payment_status: 'paid',
          signed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking_id);

      // Notifier le concierge de la fin de prestation (avec mode de paiement réel)
      try {
        await supabase.functions.invoke('notify-concierge-completion', {
          body: { bookingId: booking.id }
        });
        log("Concierge notified for room payment completion");
      } catch (notifyError: any) {
        log("Failed to notify concierge", { error: notifyError.message });
      }

      result = {
        ...result,
        success: true,
        payment_method: 'room',
        transfer: transferResult,
        ledger_amount: ledgerAmount,
        invoice_url: paidInvoice.hosted_invoice_url,
        invoice_pdf: paidInvoice.invoice_pdf,
        message: "Room payment finalized. Stripe Invoice created. Hairdresser paid (cash advance). Concierge notified.",
      };
    }

    log("Finalize payment completed", result);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    log("Error", { message: error.message, stack: error.stack });
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// NOTE: Concierge notification is now handled by the 'notify-concierge-completion' edge function
// which is called after successful payment finalization. This provides a unified notification
// with dynamic content based on the final payment method (room or card).
