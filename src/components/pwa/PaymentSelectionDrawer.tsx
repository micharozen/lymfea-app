import { useState, useEffect, useRef, useCallback } from "react";
import { CreditCard, Hotel, Loader2, ExternalLink, Check, AlertTriangle, X, CheckCircle2, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatPrice";

// Success Animation Component
const PaymentSuccessView = ({ onComplete, t }: { onComplete: () => void; t: (key: string) => string }) => {
  useEffect(() => {
    // Auto-complete after animation
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in duration-500">
      <div className="relative">
        <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
        <div className="relative w-24 h-24 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg">
          <CheckCircle2 className="w-12 h-12 text-white animate-in zoom-in duration-300 delay-200" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-green-600 mt-6 animate-in slide-in-from-bottom duration-500 delay-300">
        {t('payment.received')}
      </h3>
      <p className="text-sm text-muted-foreground mt-2 animate-in slide-in-from-bottom duration-500 delay-500">
        {t('payment.serviceFinalized')}
      </p>
    </div>
  );
};

// QR Code component for payment URL - LOCKED STATE with polling
const PaymentQRCodeView = ({
  paymentUrl,
  onOpenPaymentLink,
  onCancelPayment,
  cancelling,
  isPolling,
  t
}: {
  paymentUrl: string;
  onOpenPaymentLink: () => void;
  onCancelPayment: () => void;
  cancelling: boolean;
  isPolling: boolean;
  t: (key: string) => string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrGenerated, setQrGenerated] = useState(false);

  useEffect(() => {
    const generateQR = async () => {
      if (!canvasRef.current || !paymentUrl) return;
      
      try {
        await QRCode.toCanvas(canvasRef.current, paymentUrl, {
          width: 220,
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
      {/* Success Banner with polling indicator */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
        <Check className="w-8 h-8 text-green-600 mx-auto mb-2" />
        <p className="font-medium text-green-800 dark:text-green-200">
          {t('payment.linkActive')}
        </p>
        <div className="flex items-center justify-center gap-2 mt-2">
          {isPolling && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          )}
          <p className="text-xs text-green-600 dark:text-green-400">
            {t('payment.waitingForPayment')}
          </p>
        </div>
      </div>

      {/* QR Code Display - Full Focus */}
      <div className="flex flex-col items-center">
        <div className="bg-white p-5 rounded-2xl shadow-xl border-2 border-primary/20">
          <canvas ref={canvasRef} className="rounded-lg" />
        </div>
        <p className="text-sm text-muted-foreground mt-4 text-center font-medium">
          {t('payment.scanQrCode')}
        </p>
      </div>

      {/* Open Link Button */}
      <Button
        onClick={onOpenPaymentLink}
        variant="outline"
        className="w-full h-12"
        size="lg"
      >
        <ExternalLink className="w-4 h-4 mr-2" />
        {t('payment.openLinkManually')}
      </Button>

      {/* Tip Box */}
      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
        <p className="font-medium mb-1">💡 {t('payment.tip')}</p>
        <p>{t('payment.tipMessage')}</p>
      </div>

      {/* CANCEL BUTTON - Only way out */}
      <div className="pt-4 border-t border-border">
        <button
          onClick={onCancelPayment}
          disabled={cancelling}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-destructive hover:text-destructive/80 hover:bg-destructive/5 rounded-lg transition-colors disabled:opacity-50"
        >
          {cancelling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
          {t('payment.cancelPaymentLink')}
        </button>
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
  venueType?: 'hotel' | 'coworking' | 'enterprise' | null;
  currency?: string;
  onSignatureRequired: () => void;
  onPaymentComplete: () => void;
  onTapToPayRequested: () => void;
}

type PaymentStep = 'selection' | 'card-processing' | 'card-ready' | 'room-processing' | 'success';

export const PaymentSelectionDrawer = ({
  open,
  onOpenChange,
  bookingId,
  bookingNumber,
  totalPrice,
  treatments,
  vatRate,
  venueType,
  currency = 'EUR',
  onSignatureRequired,
  onPaymentComplete,
  onTapToPayRequested,
}: PaymentSelectionDrawerProps) => {
  // Coworking spaces don't support room payment
  const supportsRoomPayment = venueType !== 'coworking';
  const { t } = useTranslation('pwa');
  const [step, setStep] = useState<PaymentStep>('selection');
  const [processing, setProcessing] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate breakdown
  const totalHT = totalPrice / (1 + vatRate / 100);
  const tvaAmount = totalPrice - totalHT;

  // Check if in a locked/pending state (cannot go back normally)
  const isPaymentPending = step === 'card-processing' || step === 'card-ready' || step === 'room-processing' || step === 'success';

  // Polling function to check payment status
  const checkPaymentStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('payment_status, status')
        .eq('id', bookingId)
        .single();

      if (error) {
        console.error('Error checking payment status:', error);
        return false;
      }

      // Check if payment is completed
      if (data?.payment_status === 'paid' || data?.status === 'Terminé' || data?.status === 'completed') {
        return true;
      }

      return false;
    } catch (err) {
      console.error('Polling error:', err);
      return false;
    }
  }, [bookingId]);

  // Start polling when QR code is ready
  useEffect(() => {
    if (step === 'card-ready' && paymentUrl) {
      setIsPolling(true);
      
      // Poll every 3 seconds
      pollingRef.current = setInterval(async () => {
        const isPaid = await checkPaymentStatus();
        if (isPaid) {
          // Stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setIsPolling(false);
          setStep('success');
          toast.success(t('payment.received'));
        }
      }, 3000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsPolling(false);
      };
    }
  }, [step, paymentUrl, checkPaymentStatus]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Handle success completion
  const handleSuccessComplete = useCallback(() => {
    setStep('selection');
    setPaymentUrl(null);
    onOpenChange(false);
    onPaymentComplete();
  }, [onOpenChange, onPaymentComplete]);

  const handleCardPayment = async () => {
    setProcessing(true);
    setStep('card-processing');

    try {
      const { data, error } = await invokeEdgeFunction<unknown, { payment_url?: string }>('finalize-payment', {
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
      toast.error(error.message || t('payment.errorCreating'));
      setStep('selection');
    } finally {
      setProcessing(false);
    }
  };

  const handleRoomPayment = () => {
    // Close this drawer and trigger signature flow
    // The signature flow will handle the room payment finalization
    onOpenChange(false);
    onSignatureRequired();
  };

  const handleOpenPaymentLink = () => {
    if (paymentUrl) {
      window.open(paymentUrl, '_blank');
    }
  };

  const handleCancelPaymentRequest = () => {
    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    setCancelling(true);
    
    try {
      // Reset the booking payment status to allow another attempt
      const { error } = await supabase
        .from('bookings')
        .update({ 
          payment_status: 'pending',
          stripe_invoice_url: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (error) throw error;

      toast.success(t('payment.linkCancelled'));

      // Reset state
      setPaymentUrl(null);
      setStep('selection');
      setShowCancelDialog(false);
    } catch (error: any) {
      console.error("Cancel payment error:", error);
      toast.error(t('payment.errorCancelling'));
    } finally {
      setCancelling(false);
    }
  };

  // Prevent closing drawer when payment is pending (unless cancelled)
  const handleDrawerClose = () => {
    if (isPaymentPending) {
      // Don't allow closing - show cancel dialog instead
      if (step === 'card-ready') {
        setShowCancelDialog(true);
      }
      return;
    }
    
    setStep('selection');
    setPaymentUrl(null);
    onOpenChange(false);
  };

  return (
    <>
      <Drawer open={open} onOpenChange={handleDrawerClose}>
        <DrawerContent className="pb-safe max-h-[90vh]">
          <DrawerHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-3">
            <DrawerTitle className="text-lg font-semibold flex-1">
                {step === 'selection' && t('payment.finalizeService')}
                {step === 'card-processing' && t('payment.preparingPayment')}
                {step === 'card-ready' && t('payment.cardPayment')}
                {step === 'room-processing' && t('payment.processing')}
                {step === 'success' && t('payment.confirmed')}
              </DrawerTitle>
              
              {/* Lock indicator when pending */}
              {isPaymentPending && step !== 'card-processing' && (
                <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{t('payment.inProgress')}</span>
                </div>
              )}
            </div>
          </DrawerHeader>

          <div className="p-6">
            {/* Order Summary - Always visible but compact when pending */}
            <div className={`bg-muted/50 rounded-xl p-4 mb-6 ${isPaymentPending ? 'opacity-75' : ''}`}>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">{t('payment.summary')}</h4>
                <span className="text-lg font-bold">{formatPrice(totalPrice, currency)}</span>
              </div>
              
              {/* Only show details when not pending */}
              {!isPaymentPending && (
                <div className="space-y-2 mt-3">
                  {treatments.map((treatment, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{treatment.name}</span>
                      <span className="font-medium">{formatPrice(treatment.price, currency)}</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-2 mt-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t('payment.totalHT')}</span>
                      <span>{formatPrice(totalHT, currency)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t('payment.vat')} ({vatRate}%)</span>
                      <span>{formatPrice(tvaAmount, currency)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Selection Step - ONLY when not pending */}
            {step === 'selection' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center mb-4">
                  {t('payment.howToPay')}
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
                    <p className="font-bold text-lg">💳 {t('payment.payByCard')}</p>
                    <p className="text-sm text-white/80">{t('payment.cardDescription')}</p>
                  </div>
                </button>

                {/* Room Payment Button - Only for hotels */}
                {supportsRoomPayment && (
                  <button
                    onClick={handleRoomPayment}
                    disabled={processing}
                    className="w-full bg-gradient-to-r from-amber-600 to-amber-500 text-white rounded-2xl p-5 flex items-center gap-4 hover:from-amber-700 hover:to-amber-600 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                      <Hotel className="w-7 h-7" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-bold text-lg">🏨 {t('payment.addToRoom')}</p>
                      <p className="text-sm text-white/80">{t('payment.roomDescription')}</p>
                    </div>
                  </button>
                )}

                {/* Tap to Pay Button */}
                <button
                  onClick={onTapToPayRequested}
                  disabled={processing}
                  className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white rounded-2xl p-5 flex items-center gap-4 hover:from-green-700 hover:to-green-600 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                    <Smartphone className="w-7 h-7" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-bold text-lg">📱 {t('payment.tapToPay')}</p>
                    <p className="text-sm text-white/80">{t('payment.tapToPayDescription')}</p>
                  </div>
                </button>
              </div>
            )}

            {/* Card Processing Step - LOCKED */}
            {step === 'card-processing' && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                <p className="text-muted-foreground font-medium">{t('payment.creatingLink')}</p>
                <p className="text-xs text-muted-foreground mt-2">{t('payment.pleaseWait')}</p>
              </div>
            )}

            {/* Card Ready Step with QR Code - LOCKED until cancel */}
            {step === 'card-ready' && paymentUrl && (
              <PaymentQRCodeView
                paymentUrl={paymentUrl}
                onOpenPaymentLink={handleOpenPaymentLink}
                onCancelPayment={handleCancelPaymentRequest}
                cancelling={cancelling}
                isPolling={isPolling}
                t={t}
              />
            )}

            {/* Success Step - Auto-closes */}
            {step === 'success' && (
              <PaymentSuccessView onComplete={handleSuccessComplete} t={t} />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {t('payment.cancelTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('payment.cancelDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              {t('payment.keepLink')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('payment.cancelling')}
                </>
              ) : (
                t('payment.yesCancel')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
