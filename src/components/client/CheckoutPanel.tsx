import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Loader2, AlertTriangle, CreditCard, Building, Gift, Calendar,
} from 'lucide-react';
import { useBasket } from '@/pages/client/context/CartContext';
import { useClientFlow } from '@/pages/client/context/FlowContext';
import { useCreateOffertBooking } from '@/pages/client/hooks/useCreateOffertBooking';
import { useVenueTerms, type VenueType } from '@/hooks/useVenueTerms';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { format, parse } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';

interface CheckoutPanelProps {
  hotelId: string;
  onBack: () => void;
  embedded?: boolean;
  className?: string;
}

export function CheckoutPanel({
  hotelId,
  onBack,
  embedded = false,
  className,
}: CheckoutPanelProps) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('client');
  const locale = i18n.language === 'fr' ? fr : enUS;
  const { items, total, fixedTotal, hasPriceOnRequest, clearBasket } = useBasket();
  const {
    bookingDateTime, clientInfo, therapistGenderPreference,
    setPendingCheckoutSession, clearFlow,
  } = useClientFlow();
  const { createOffertBooking, isCreating: isOffertProcessing } = useCreateOffertBooking(hotelId);

  const [selectedMethod, setSelectedMethod] = useState<'room' | 'card'>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const { trackPageView } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);

  const { data: hotel } = useQuery({
    queryKey: ['public-hotel', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_public_hotel_by_id', { _hotel_id: hotelId });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const venueType = hotel?.venue_type as VenueType | null;
  const venueTerms = useVenueTerms(venueType);
  const isOffert = !!hotel?.offert || !!hotel?.company_offered;
  const isCompanyOffered = !!hotel?.company_offered;
  const supportsRoomPayment = venueTerms.supportsRoomPayment;

  // Track page view once
  useEffect(() => {
    if (!hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackPageView('checkout_panel');
    }
  }, [trackPageView]);

  // Default payment method based on venue type
  useEffect(() => {
    if (venueType === 'coworking' || venueType === 'enterprise') {
      setSelectedMethod('card');
    }
  }, [venueType]);

  // Separate fixed and variable items
  const fixedItems = items.filter(item => !item.isPriceOnRequest);
  const variableItems = items.filter(item => item.isPriceOnRequest);

  const handlePayment = async () => {
    if (!bookingDateTime || !clientInfo) {
      toast.error(t('common:errors.generic'));
      onBack();
      return;
    }

    setIsProcessing(true);

    try {
      if (isOffert) {
        await createOffertBooking(clientInfo, bookingDateTime);
        return;
      } else if (selectedMethod === 'card' && !hasPriceOnRequest) {
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: {
            hotelId,
            clientData: {
              firstName: clientInfo.firstName,
              lastName: clientInfo.lastName,
              phone: `${clientInfo.countryCode}${clientInfo.phone}`,
              email: clientInfo.email,
              roomNumber: clientInfo.roomNumber,
              note: clientInfo.note || '',
            },
            bookingData: {
              date: bookingDateTime.date,
              time: bookingDateTime.time,
            },
            treatmentIds: items.map(item => item.id),
            treatments: items.map(item => ({
              treatmentId: item.id,
              variantId: item.variantId,
            })),
            totalPrice: total,
            ...(therapistGenderPreference ? { therapistGender: therapistGenderPreference } : {}),
          },
        });

        if (error) throw error;

        if (data?.url) {
          const url = new URL(data.url);
          const trustedDomains = ['checkout.stripe.com', 'stripe.com'];
          if (!trustedDomains.some(domain => url.hostname.endsWith(domain))) {
            throw new Error('Invalid redirect URL');
          }
          setPendingCheckoutSession(data.sessionId);
          window.location.href = data.url;
        }
      } else {
        // Room payment or quote request
        const { data, error } = await supabase.functions.invoke('create-client-booking', {
          body: {
            hotelId,
            clientData: {
              firstName: clientInfo.firstName,
              lastName: clientInfo.lastName,
              phone: `${clientInfo.countryCode}${clientInfo.phone}`,
              email: clientInfo.email,
              roomNumber: clientInfo.roomNumber,
              note: clientInfo.note || '',
              pmsGuestCheckIn: clientInfo.pmsGuestCheckIn,
              pmsGuestCheckOut: clientInfo.pmsGuestCheckOut,
            },
            bookingData: {
              date: bookingDateTime.date,
              time: bookingDateTime.time,
            },
            treatments: items.map(item => ({
              treatmentId: item.id,
              variantId: item.variantId,
              quantity: item.quantity,
              note: item.note,
            })),
            paymentMethod: hasPriceOnRequest ? 'quote' : 'room',
            totalPrice: fixedTotal,
            ...(therapistGenderPreference ? { therapistGender: therapistGenderPreference } : {}),
          },
        });

        if (error) throw error;

        clearBasket();
        clearFlow();
        navigate(`/client/${hotelId}/confirmation/${data.bookingId}`);
      }
    } catch (error: any) {
      console.error('Payment error:', error);

      const errorBody = error?.context?.body;
      let errorCode = '';
      if (typeof errorBody === 'string') {
        try { errorCode = JSON.parse(errorBody)?.error || ''; } catch { /* ignore */ }
      } else if (errorBody?.error) {
        errorCode = errorBody.error;
      }
      if (!errorCode && error?.message) {
        errorCode = error.message;
      }

      if (errorCode === 'SLOT_TAKEN' || errorCode === 'BLOCKED_SLOT' || errorCode === 'LEAD_TIME_VIOLATION') {
        const messageKey = errorCode === 'SLOT_TAKEN' ? 'errors.slotTaken'
          : errorCode === 'BLOCKED_SLOT' ? 'errors.blockedSlot'
          : 'errors.leadTimeViolation';
        toast.error(t(messageKey));
        navigate(`/client/${hotelId}/schedule`, {
          state: { takenDate: bookingDateTime?.date, takenTime: bookingDateTime?.time },
        });
        return;
      }

      const errorMessage = error instanceof Error ? error.message : t('common:errors.generic');
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // Format the booking time for display (e.g. "14:00:00" → "14:00")
  const formatTime = (time: string) => time.slice(0, 5);

  return (
    <div className={cn(
      embedded ? "px-4 py-4 space-y-5" : "px-4 py-4 sm:px-6 sm:py-6 space-y-8",
      className
    )}>
      {/* Panel title */}
      <div>
        <h3 className="font-serif text-lg text-gray-900 leading-tight">
          {t('payment.headline')}
        </h3>
      </div>

      {/* Booking date/time display */}
      {bookingDateTime && (
        <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
          <div className="w-9 h-9 rounded-full bg-gold-500/10 flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4 text-gold-600" />
          </div>
          <div>
            <p className="text-sm text-gray-900 font-medium">
              {format(
                parse(bookingDateTime.date, 'yyyy-MM-dd', new Date()),
                'EEEE d MMMM',
                { locale }
              )}
            </p>
            <p className="text-xs text-gray-500">
              {t('checkoutPanel.at')} {formatTime(bookingDateTime.time)}
            </p>
          </div>
        </div>
      )}

      {/* Offert Banner */}
      {isOffert && !isCompanyOffered && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Gift className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-medium text-emerald-700 text-sm">{t('offert.banner')}</h4>
              <p className="text-xs text-emerald-600/70">{t('offert.bannerDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Company Offered Banner */}
      {isCompanyOffered && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Building className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-medium text-blue-700 text-sm">{t('companyOffered.banner')}</h4>
              <p className="text-xs text-blue-600/70">{t('companyOffered.bannerDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quote Warning Banner */}
      {!isOffert && hasPriceOnRequest && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-medium text-amber-400 text-sm">{t('payment.quoteRequired')}</h4>
              <p className="text-xs text-amber-400/70">{t('payment.quoteRequiredDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Order Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h4 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
          {t('payment.orderSummary')}
        </h4>

        {isOffert ? (
          <div className="space-y-2">
            {items.map(item => (
              <div key={`${item.id}-${item.variantId}`} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {item.name} <span className="text-gray-400">x{item.quantity}</span>
                </span>
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="text-xs text-gray-400 line-through font-light">
                    {item.isPriceOnRequest ? t('payment.onQuote') : formatPrice(item.price * item.quantity, item.currency || 'EUR')}
                  </span>
                  <span className="text-sm font-medium text-emerald-600">
                    {formatPrice(0, item.currency || 'EUR')}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            {fixedItems.length > 0 && (
              <div className="space-y-2">
                {fixedItems.map(item => (
                  <div key={`${item.id}-${item.variantId}`} className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {item.name} <span className="text-gray-400">x{item.quantity}</span>
                    </span>
                    <span className="text-gray-900 font-light">
                      {formatPrice(item.price * item.quantity, item.currency || 'EUR')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {variableItems.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-gray-200">
                {variableItems.map(item => (
                  <div key={`${item.id}-${item.variantId}`} className="flex justify-between text-sm items-center">
                    <span className="text-gray-600">
                      {item.name} <span className="text-gray-400">x{item.quantity}</span>
                    </span>
                    <span className="text-amber-400 text-xs font-medium">{t('payment.onQuote')}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Total */}
        <div className="flex justify-between items-center pt-3 border-t border-gray-200">
          <span className="text-gray-500 text-sm uppercase tracking-wider">{t('checkout.total')}</span>
          {isOffert ? (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-sm text-gray-400 line-through font-light">{formatPrice(total, items[0]?.currency || 'EUR')}</span>
              <span className="text-emerald-600 text-lg font-serif">{formatPrice(0, items[0]?.currency || 'EUR')}</span>
            </span>
          ) : hasPriceOnRequest ? (
            <div className="text-right">
              <span className="text-gray-900 text-base font-light">{formatPrice(fixedTotal, items[0]?.currency || 'EUR')}</span>
              <span className="text-amber-400 text-sm ml-2">{t('payment.plusQuote')}</span>
            </div>
          ) : (
            <span className="text-gold-600 text-lg font-serif">{formatPrice(total, items[0]?.currency || 'EUR')}</span>
          )}
        </div>
      </div>

      {/* Payment Method Selection */}
      {!isOffert && !hasPriceOnRequest && (
        <div className="space-y-3">
          <h4 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
            {t('payment.paymentMethod')}
          </h4>

          {/* Card Payment */}
          <button
            type="button"
            onClick={() => setSelectedMethod('card')}
            className={cn(
              "w-full p-3 rounded-lg border transition-all duration-200 text-left",
              selectedMethod === 'card'
                ? "border-gold-500 bg-gold-500/10"
                : "border-gray-200 bg-white hover:border-gray-300"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center transition-all",
                selectedMethod === 'card' ? "bg-gold-400 text-black" : "bg-gray-100 text-gray-500"
              )}>
                <CreditCard className="h-4 w-4" />
              </div>
              <div>
                <p className={cn(
                  "text-sm font-medium",
                  selectedMethod === 'card' ? "text-gold-600" : "text-gray-900"
                )}>{t('payment.payNow')}</p>
                <p className="text-xs text-gray-400">{t('payment.payNowDesc')}</p>
              </div>
            </div>
          </button>

          {/* Room Payment */}
          {supportsRoomPayment && (
            <button
              type="button"
              onClick={() => setSelectedMethod('room')}
              className={cn(
                "w-full p-3 rounded-lg border transition-all duration-200 text-left",
                selectedMethod === 'room'
                  ? "border-gold-500 bg-gold-500/10"
                  : "border-gray-200 bg-white hover:border-gray-300"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center transition-all",
                  selectedMethod === 'room' ? "bg-gold-400 text-black" : "bg-gray-100 text-gray-500"
                )}>
                  <Building className="h-4 w-4" />
                </div>
                <div>
                  <p className={cn(
                    "text-sm font-medium",
                    selectedMethod === 'room' ? "text-gold-600" : "text-gray-900"
                  )}>{venueTerms.addToLocationLabel}</p>
                  <p className="text-xs text-gray-400">{venueTerms.addToLocationDesc}</p>
                </div>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Confirm/Pay Button */}
      {embedded ? (
        <div className="sticky bottom-0 z-10 p-4 -mx-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
          <Button
            onClick={handlePayment}
            disabled={isProcessing || isOffertProcessing}
            className={cn(
              "w-full h-12 font-medium tracking-widest text-base transition-all duration-300 disabled:bg-gray-200 disabled:text-gray-400",
              isOffert
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : hasPriceOnRequest
                  ? "bg-amber-500 text-black hover:bg-amber-400"
                  : "bg-gray-900 text-white hover:bg-gray-800"
            )}
          >
            {(isProcessing || isOffertProcessing) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('payment.processing')}
              </>
            ) : isOffert ? (
              t('offert.confirmFreeBooking')
            ) : hasPriceOnRequest ? (
              t('payment.requestQuote')
            ) : selectedMethod === 'card' ? (
              t('payment.payNow')
            ) : (
              t('payment.confirmBook')
            )}
          </Button>
        </div>
      ) : (
        <>
          <div className="h-20" />
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pb-safe z-30">
            <Button
              onClick={handlePayment}
              disabled={isProcessing || isOffertProcessing}
              className={cn(
                "w-full h-12 sm:h-14 md:h-16 font-medium tracking-widest text-base transition-all duration-300 disabled:bg-gray-200 disabled:text-gray-400",
                isOffert
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : hasPriceOnRequest
                    ? "bg-amber-500 text-black hover:bg-amber-400"
                    : "bg-gray-900 text-white hover:bg-gray-800"
              )}
            >
              {(isProcessing || isOffertProcessing) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('payment.processing')}
                </>
              ) : isOffert ? (
                t('offert.confirmFreeBooking')
              ) : hasPriceOnRequest ? (
                t('payment.requestQuote')
              ) : selectedMethod === 'card' ? (
                t('payment.payNow')
              ) : (
                t('payment.confirmBook')
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
