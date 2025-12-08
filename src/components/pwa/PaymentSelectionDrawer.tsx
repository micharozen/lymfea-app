import { useState, useEffect, useRef } from "react";
import { CreditCard, Hotel, Loader2, ArrowLeft, ExternalLink, Check } from "lucide-react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// QR Code component for payment URL
const PaymentQRCodeView = ({ 
  paymentUrl, 
  onOpenPaymentLink, 
  onBack 
}: { 
  paymentUrl: string; 
  onOpenPaymentLink: () => void; 
  onBack: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrGenerated, setQrGenerated] = useState(false);

  useEffect(() => {
    const generateQR = async () => {
      if (!canvasRef.current || !paymentUrl) return;
      
      try {
        await QRCode.toCanvas(canvasRef.current, paymentUrl, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
        setQrGenerated(true);
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };
    
    generateQR();
  }, [paymentUrl]);

  return (
    <div className="space-y-6">
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
        <Check className="w-8 h-8 text-green-600 mx-auto mb-2" />
        <p className="font-medium text-green-800 dark:text-green-200">
          Lien de paiement prêt !
        </p>
      </div>

      {/* QR Code Display */}
      <div className="flex flex-col items-center">
        <div className="bg-white p-4 rounded-2xl shadow-lg">
          <canvas ref={canvasRef} className="rounded-lg" />
        </div>
        <p className="text-sm text-muted-foreground mt-3 text-center">
          Le client scanne ce QR code pour payer
        </p>
      </div>

      <div className="space-y-3">
        <Button
          onClick={onOpenPaymentLink}
          variant="outline"
          className="w-full h-12"
          size="lg"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Ouvrir le lien manuellement
        </Button>
      </div>

      <div className="text-center">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Le client préfère payer autrement
        </button>
      </div>

      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
        <p className="font-medium mb-1">💡 Astuce</p>
        <p>Une fois le paiement effectué, votre commission sera automatiquement versée sur votre compte.</p>
      </div>
    </div>
  );
};

interface Treatment {
  name: string;
  price: number;
  duration: number;
}

interface PaymentSelectionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  bookingNumber: number;
  totalPrice: number;
  treatments: Treatment[];
  vatRate: number;
  onSignatureRequired: () => void;
  onPaymentComplete: () => void;
}

type PaymentStep = 'selection' | 'card-processing' | 'card-ready' | 'room-signature';

export const PaymentSelectionDrawer = ({
  open,
  onOpenChange,
  bookingId,
  bookingNumber,
  totalPrice,
  treatments,
  vatRate,
  onSignatureRequired,
  onPaymentComplete,
}: PaymentSelectionDrawerProps) => {
  const { t } = useTranslation('pwa');
  const [step, setStep] = useState<PaymentStep>('selection');
  const [processing, setProcessing] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  // Calculate breakdown
  const totalHT = totalPrice / (1 + vatRate / 100);
  const tvaAmount = totalPrice - totalHT;

  const handleCardPayment = async () => {
    setProcessing(true);
    setStep('card-processing');

    try {
      const { data, error } = await supabase.functions.invoke('finalize-payment', {
        body: {
          booking_id: bookingId,
          payment_method: 'card',
          final_amount: totalPrice,
        },
      });

      if (error) throw error;

      if (data?.payment_url) {
        setPaymentUrl(data.payment_url);
        setStep('card-ready');
      } else {
        throw new Error("No payment URL returned");
      }
    } catch (error: any) {
      console.error("Card payment error:", error);
      toast.error(error.message || "Erreur lors de la création du paiement");
      setStep('selection');
    } finally {
      setProcessing(false);
    }
  };

  const handleRoomPayment = () => {
    // Close this drawer and trigger signature flow
    onOpenChange(false);
    onSignatureRequired();
  };

  const handleOpenPaymentLink = () => {
    if (paymentUrl) {
      window.open(paymentUrl, '_blank');
    }
  };

  const handleBack = () => {
    if (step === 'card-ready') {
      // TODO: Cancel the Stripe PaymentIntent if needed
      setPaymentUrl(null);
    }
    setStep('selection');
  };

  const handleClose = () => {
    setStep('selection');
    setPaymentUrl(null);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="pb-safe max-h-[90vh]">
        <DrawerHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-3">
            {step !== 'selection' && (
              <button
                onClick={handleBack}
                className="p-1 hover:bg-muted rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <DrawerTitle className="text-lg font-semibold">
              {step === 'selection' && "Finaliser la prestation"}
              {step === 'card-processing' && "Préparation du paiement..."}
              {step === 'card-ready' && "Paiement par carte"}
              {step === 'room-signature' && "Signature client"}
            </DrawerTitle>
          </div>
        </DrawerHeader>

        <div className="p-6">
          {/* Order Summary */}
          <div className="bg-muted/50 rounded-xl p-4 mb-6">
            <h4 className="text-sm font-semibold text-foreground mb-3">Récapitulatif</h4>
            <div className="space-y-2">
              {treatments.map((treatment, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{treatment.name}</span>
                  <span className="font-medium">{treatment.price.toFixed(2)}€</span>
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Total HT</span>
                  <span>{totalHT.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>TVA ({vatRate}%)</span>
                  <span>{tvaAmount.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-base font-bold mt-2">
                  <span>Total TTC</span>
                  <span>{totalPrice.toFixed(2)}€</span>
                </div>
              </div>
            </div>
          </div>

          {/* Selection Step */}
          {step === 'selection' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Comment le client souhaite-t-il payer ?
              </p>
              
              {/* Card Payment Button */}
              <button
                onClick={handleCardPayment}
                disabled={processing}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl p-5 flex items-center gap-4 hover:from-blue-700 hover:to-blue-600 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-7 h-7" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-bold text-lg">💳 Payer par Carte</p>
                  <p className="text-sm text-white/80">Paiement immédiat par carte bancaire</p>
                </div>
              </button>

              {/* Room Payment Button */}
              <button
                onClick={handleRoomPayment}
                disabled={processing}
                className="w-full bg-gradient-to-r from-amber-600 to-amber-500 text-white rounded-2xl p-5 flex items-center gap-4 hover:from-amber-700 hover:to-amber-600 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                  <Hotel className="w-7 h-7" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-bold text-lg">🏨 Ajouter à la Chambre</p>
                  <p className="text-sm text-white/80">Le client signe, l'hôtel débite</p>
                </div>
              </button>
            </div>
          )}

          {/* Card Processing Step */}
          {step === 'card-processing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Création du lien de paiement...</p>
            </div>
          )}

          {/* Card Ready Step with QR Code */}
          {step === 'card-ready' && paymentUrl && (
            <PaymentQRCodeView 
              paymentUrl={paymentUrl}
              onOpenPaymentLink={handleOpenPaymentLink}
              onBack={handleBack}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
