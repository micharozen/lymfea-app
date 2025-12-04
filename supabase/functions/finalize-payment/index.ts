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

    // 1. Récupérer le booking avec les relations
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        booking_treatments(
          treatment_id,
          treatment_menus(name, price)
        )
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      log("Booking not found", { bookingError });
      throw new Error(`Booking not found: ${booking_id}`);
    }

    log("Booking found", { booking_id: booking.booking_id, hotel_id: booking.hotel_id });

    // 2. Récupérer l'hôtel avec ses paramètres fiscaux
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('*')
      .eq('id', booking.hotel_id)
      .single();

    if (hotelError || !hotel) {
      log("Hotel not found", { hotelError });
      throw new Error(`Hotel not found: ${booking.hotel_id}`);
    }

    log("Hotel found", { 
      name: hotel.name, 
      vat: hotel.vat, 
      hotel_commission: hotel.hotel_commission,
      hairdresser_commission: hotel.hairdresser_commission 
    });

    // 3. Récupérer le coiffeur avec son compte Stripe
    let hairdresser = null;
    if (booking.hairdresser_id) {
      const { data: hd, error: hdError } = await supabase
        .from('hairdressers')
        .select('*')
        .eq('id', booking.hairdresser_id)
        .single();

      if (hdError) {
        log("Hairdresser fetch error", { hdError });
      } else {
        hairdresser = hd;
        log("Hairdresser found", { 
          name: `${hairdresser.first_name} ${hairdresser.last_name}`,
          stripe_account_id: hairdresser.stripe_account_id 
        });
      }
    }

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

    // 5. Traitement selon le mode de paiement
    if (payment_method === 'card') {
      // ===== PAIEMENT CARTE =====
      log("Processing CARD payment");

      // Créer un Payment Link Stripe
      // On stocke les metadata pour le webhook
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency: hotel.currency?.toLowerCase() || 'eur',
              product_data: {
                name: `Prestation OOM - Réservation #${booking.booking_id}`,
                description: `${hotel.name} - ${booking.client_first_name} ${booking.client_last_name}`,
              },
              unit_amount: Math.round(totalTTC * 100), // En centimes
            },
            quantity: 1,
          },
        ],
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
            url: `${Deno.env.get("SITE_URL") || 'https://xbkvmrqanoqdqvqwldio.lovableproject.com'}/pwa/bookings?payment=success&booking=${booking.booking_id}`,
          },
        },
      });

      log("Payment link created", { url: paymentLink.url });

      // Mettre à jour le booking avec le statut en attente de paiement
      await supabase
        .from('bookings')
        .update({
          payment_method: 'card',
          payment_status: 'pending',
          total_price: totalTTC,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking_id);

      result = {
        ...result,
        success: true,
        payment_method: 'card',
        payment_url: paymentLink.url,
        message: "Payment link created. Client must complete payment.",
      };

    } else {
      // ===== PAIEMENT CHAMBRE =====
      log("Processing ROOM payment");

      // Vérifier que la signature est présente
      if (!signature_data) {
        throw new Error("Signature is required for room payment");
      }

      // Sauvegarder la signature dans le booking
      await supabase
        .from('bookings')
        .update({
          client_signature: signature_data,
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
            currency: hotel.currency?.toLowerCase() || 'eur',
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
      // Montant positif = l'hôtel collecte l'argent et doit à OOM
      const ledgerAmount = totalTTC - breakdown.hotelCommission;
      
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
          status: 'Complété',
          payment_status: 'paid',
          signed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking_id);

      // Notifier le concierge
      try {
        await notifyConcierge(supabase, booking, hotel, totalTTC, signature_data);
        log("Concierge notified");
      } catch (notifyError: any) {
        log("Failed to notify concierge", { error: notifyError.message });
      }

      result = {
        ...result,
        success: true,
        payment_method: 'room',
        transfer: transferResult,
        ledger_amount: ledgerAmount,
        message: "Room payment finalized. Hairdresser paid (cash advance). Concierge notified.",
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

// Fonction pour notifier le concierge
async function notifyConcierge(
  supabase: any, 
  booking: any, 
  hotel: any, 
  amount: number, 
  signature: string
) {
  // Récupérer les concierges de l'hôtel
  const { data: conciergeHotels } = await supabase
    .from('concierge_hotels')
    .select('concierge_id')
    .eq('hotel_id', booking.hotel_id);

  if (!conciergeHotels?.length) {
    log("No concierges found for hotel");
    return;
  }

  const conciergeIds = conciergeHotels.map((ch: any) => ch.concierge_id);

  const { data: concierges } = await supabase
    .from('concierges')
    .select('email, first_name, last_name')
    .in('id', conciergeIds)
    .eq('status', 'Actif');

  if (!concierges?.length) {
    log("No active concierges found");
    return;
  }

  // Appeler la fonction d'envoi d'email
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    log("RESEND_API_KEY not configured");
    return;
  }

  for (const concierge of concierges) {
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #000; color: #fff; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .amount { font-size: 24px; font-weight: bold; color: #000; }
          .signature { margin-top: 20px; padding: 10px; background: #fff; border: 1px solid #ddd; }
          .signature img { max-width: 100%; height: auto; }
          .action { background: #ff6b35; color: #fff; padding: 15px; text-align: center; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ ACTION REQUISE</h1>
          </div>
          <div class="content">
            <p>Bonjour ${concierge.first_name},</p>
            <p>Une prestation OOM vient d'être finalisée et doit être facturée sur la chambre du client.</p>
            
            <h2>Détails de la réservation</h2>
            <ul>
              <li><strong>Réservation :</strong> #${booking.booking_id}</li>
              <li><strong>Client :</strong> ${booking.client_first_name} ${booking.client_last_name}</li>
              <li><strong>Chambre :</strong> ${booking.room_number || 'Non spécifiée'}</li>
              <li><strong>Hôtel :</strong> ${hotel.name}</li>
            </ul>
            
            <div class="action">
              <p class="amount">Montant à débiter : ${amount.toFixed(2)} €</p>
            </div>
            
            <div class="signature">
              <h3>Signature du client :</h3>
              <img src="${signature}" alt="Signature client" />
            </div>
            
            <p style="margin-top: 20px;">
              Merci de débiter ce montant sur la note de chambre du client.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'OOM App <booking@oomworld.com>',
          to: [concierge.email],
          subject: `⚠️ ACTION REQUISE : Débiter Chambre ${booking.room_number || 'N/A'} - ${amount.toFixed(2)}€ - Réservation #${booking.booking_id}`,
          html: emailHtml,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log(`Failed to send email to ${concierge.email}`, { error: errorText });
      } else {
        log(`Email sent to concierge: ${concierge.email}`);
      }
    } catch (emailError: any) {
      log(`Error sending email to ${concierge.email}`, { error: emailError.message });
    }
  }
}
