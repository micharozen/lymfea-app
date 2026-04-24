import { useState, useEffect, useRef, useCallback } from "react";
import { CreditCard, Building2, Loader2, ExternalLink, Check, AlertTriangle, X, CheckCircle2, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
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

const PaymentSuccessView = ({ onComplete, t }: { onComplete: () => void; t: (key: string) => string }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in duration-500">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
        <div className="relative w-24 h-24 bg-primary rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-primary-foreground animate-in zoom-in duration-300 delay-200" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-primary mt-6 animate-in slide-in-from-bottom duration-500 delay-300">
        {t('payment.received')}
      </h3>
      <p className="text-sm text-muted-foreground mt-2 animate-in slide-in-from-bottom duration-500 delay-500">
        {t('payment.serviceFinalized')}
      </p>
    </div>
  );
};

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
          color: { dark: '#000000', light: '#FFFFFF' },
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
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
        <Check className="w-8 h-8 text-primary mx-auto mb-2" />
        <p className="font-medium text-foreground">{t('payment.linkActive')}</p>
        <div className="flex items-center justify-center gap-2 mt-2">
          {isPolling && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          )}
          <p className="text-xs text-muted-foreground">{t('payment.waitingForPayment')}</p>
        </div>
      </div>
      <div className="flex flex-col items-center">
        <div className="bg-card p-5 rounded-2xl border-2 border-primary/20">
          <canvas ref={canvasRef} className="rounded-lg" />
        </div>
        <p className="text-sm text-muted-foreground mt-4 text-center font-medium">{t('payment.scanQrCode')}</p>
      </div>
      <Button onClick={onOpenPaymentLink} variant="outline" className="w-full h-12" size="lg">
        <ExternalLink className="w-4 h-4 mr-2" />
        {t('payment.openLinkManually')}
      </Button>
      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
        <p className="font-medium mb-1">💡 {t('payment.tip')}</p>
        <p>{t('payment.tipMessage')}</p>
      </div>
      <div className="pt-4 border-t border-border">
        <button onClick={onCancelPayment} disabled={cancelling} className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-destructive hover:text-destructive/80 hover:bg-destructive/5 rounded-lg transition-colors disabled:opacity-50">
          {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
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
  hasSavedCard?: boolean;
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
  hasSavedCard = false,
  onSignatureRequired,
  onPaymentComplete,
  onTapToPayRequested,
}: PaymentSelectionDrawerProps) => {
  const supportsRoomPayment = venueType !== 'coworking';
  const { t } = useTranslation('pwa');
  const [step, setStep] = useState<PaymentStep>('selection');
  const [processing, setProcessing] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef<number | null>(null);

  const totalHT = totalPrice / (1 + vatRate / 100);
  const tvaAmount = totalPrice - totalHT;

  const isPaymentPending = step === 'card-processing' || step === 'card-ready' || step === 'room-processing' || step === 'success';

  const checkPaymentStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('bookings').select('payment_status, status').eq('id', bookingId).single();
      if (error) return false;
      if (data?.payment_status === 'paid' || data?.status === 'Terminé' || data?.status === 'completed') return true;
      return false;
    } catch (err) {
      return false;
    }
  }, [bookingId]);

  useEffect(() => {
    if (step === 'card-ready' && paymentUrl) {
      setIsPolling(true);
      pollingRef.current = window.setInterval(async () => {
        const isPaid = await checkPaymentStatus();
        if (isPaid) {
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
          setIsPolling(false);
          setStep('success');
          toast.success(t('payment.received'));
        }
      }, 3000);
      return () => {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        setIsPolling(false);
      };
    }
  }, [step, paymentUrl, checkPaymentStatus]);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const handleSuccessComplete = useCallback(() => {
    setStep('selection');
    setPaymentUrl(null);
    onOpenChange(false);
    onPaymentComplete();
  }, [onOpenChange, onPaymentComplete]);

  const handleCardPayment = async () => {
    if (processing) return;
    setProcessing(true);

    try {
      if (hasSavedCard) {
        const { data, error } = await invokeEdgeFunction<unknown, { success?: boolean; error?: string }>('charge-saved-card', {
          body: { bookingId: bookingId, finalAmount: totalPrice },
        });
        if (error) throw error;
        if (data?.success) {
          setStep('success');
        } else {
          throw new Error(data?.error || t('payment.errorCreating'));
        }
      } else {
        const { data, error } = await invokeEdgeFunction<unknown, { payment_url?: string }>('finalize-payment', {
          body: { booking_id: bookingId, payment_method: 'card', final_amount: totalPrice },
        });
        if (error) throw error;
        if (data?.payment_url) {
          setPaymentUrl(data.payment_url);
          setStep('card-ready');
        } else {
          throw new Error("No payment URL returned");
        }
      }
    } catch (error: any) {
      toast.error(error.message || t('payment.errorCreating'));
      setStep('selection');
    } finally {
      setProcessing(false);
    }
  };

  const handleRoomPayment = () => { onOpenChange(false); onSignatureRequired(); };
  const handleOpenPaymentLink = () => { if (paymentUrl) window.open(paymentUrl, '_blank'); };
  const handleCancelPaymentRequest = () => { setShowCancelDialog(true); };

  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      const { error } = await supabase.from('bookings').update({ 
        payment_status: 'pending', stripe_invoice_url: null, updated_at: new Date().toISOString()
      }).eq('id', bookingId);
      if (error) throw error;
      toast.success(t('payment.linkCancelled'));
      setPaymentUrl(null);
      setStep('selection');
      setShowCancelDialog(false);
    } catch (error: any) {
      toast.error(t('payment.errorCancelling'));
    } finally {
      setCancelling(false);
    }
  };

  const handleDrawerClose = () => {
    if (isPaymentPending) {
      if (step === 'card-ready') setShowCancelDialog(true);
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
              {isPaymentPending && step !== 'card-processing' && (
                <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{t('payment.inProgress')}</span>
                </div>
              )}
            </div>
          </DrawerHeader>

          <div className="p-6">
            <div className={`bg-muted/50 rounded-xl p-4 mb-6 ${isPaymentPending ? 'opacity-75' : ''}`}>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">{t('payment.summary')}</h4>
                <span className="text-lg font-bold">{formatPrice(totalPrice, currency)}</span>
              </div>
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

            {step === 'selection' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center mb-3">{t('payment.howToPay')}</p>

                {supportsRoomPayment && (
                  <button onClick={handleRoomPayment} disabled={processing} className="w-full rounded-xl p-3 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all active:scale-[0.98] disabled:opacity-50">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5 text-amber-700 dark:text-amber-400" /></div>
                    <div className="text-left flex-1 min-w-0"><p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{t('payment.addToRoom')}</p><p className="text-[11px] text-amber-700/70 dark:text-amber-400/70">{t('payment.roomDescription')}</p></div>
                  </button>
                )}

                <button
                  onClick={handleCardPayment}
                  disabled={processing}
                  className={cn(
                    "w-full rounded-xl p-3 flex items-center gap-3 border transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
                    hasSavedCard
                      ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                      : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", hasSavedCard ? "bg-purple-500/15" : "bg-blue-500/15")}>
                    {processing ? <Loader2 className={cn("w-5 h-5 animate-spin", hasSavedCard ? "text-purple-700 dark:text-purple-400" : "text-blue-700 dark:text-blue-400")} /> : <CreditCard className={cn("w-5 h-5", hasSavedCard ? "text-purple-700 dark:text-purple-400" : "text-blue-700 dark:text-blue-400")} />}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className={cn("text-sm font-semibold", hasSavedCard ? "text-purple-900 dark:text-purple-100" : "text-blue-900 dark:text-blue-100")}>
                      {processing ? "Traitement en cours..." : (hasSavedCard ? "Finaliser la prestation" : t('payment.payByCard'))}
                    </p>
                    <p className={cn("text-[11px]", hasSavedCard ? "text-purple-700/70 dark:text-purple-400/70" : "text-blue-700/70 dark:text-blue-400/70")}>
                      {hasSavedCard ? "Débit sécurisé de la carte enregistrée" : t('payment.cardDescription')}
                    </p>
                  </div>
                </button>

                <button onClick={onTapToPayRequested} disabled={processing} className="w-full rounded-xl p-3 flex items-center gap-3 bg-muted/50 border border-border hover:bg-muted transition-all active:scale-[0.98] disabled:opacity-50">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Smartphone className="w-5 h-5 text-primary" /></div>
                  <div className="text-left flex-1 min-w-0"><p className="text-sm font-semibold">{t('payment.tapToPay')}</p><p className="text-[11px] text-muted-foreground">{t('payment.tapToPayDescription')}</p></div>
                </button>

                <div className="pt-4 mt-4 border-t border-border">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">{t('payment.cancellationPolicyTitle')}</span>{' '}
                    {t('payment.cancellationPolicyText')}
                  </p>
                </div>
              </div>
            )}

            {step === 'card-processing' && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                <p className="text-muted-foreground font-medium">{t('payment.creatingLink')}</p>
                <p className="text-xs text-muted-foreground mt-2">{t('payment.pleaseWait')}</p>
              </div>
            )}

            {step === 'card-ready' && paymentUrl && (
              <PaymentQRCodeView paymentUrl={paymentUrl} onOpenPaymentLink={handleOpenPaymentLink} onCancelPayment={handleCancelPaymentRequest} cancelling={cancelling} isPolling={isPolling} t={t} />
            )}

            {step === 'success' && <PaymentSuccessView onComplete={handleSuccessComplete} t={t} />}
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" />{t('payment.cancelTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('payment.cancelDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>{t('payment.keepLink')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{cancelling ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('payment.cancelling')}</> : t('payment.yesCancel')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};