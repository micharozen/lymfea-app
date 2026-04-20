import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, ChevronDown, ShoppingBag, CheckCircle2, Gift, LogIn } from 'lucide-react';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useClientFlow } from './context/FlowContext';
import { useBasket } from './context/CartContext';
import { useCreateOffertBooking } from './hooks/useCreateOffertBooking';
import { GiftCardLoginModal, type AuthCustomerInfo } from '@/components/client/GiftCardLoginModal';
import { CartDrawer } from '@/components/client/CartDrawer';
import { CheckoutPanel } from '@/components/client/CheckoutPanel';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useBundleTemplate } from '@/hooks/client/useBundleTemplate';
import type { GiftInfo } from './context/FlowContext';
import { useVenueTerms, VenueType } from '@/hooks/useVenueTerms';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';
import { usePmsGuestLookup } from '@/hooks/usePmsGuestLookup';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ProgressBar } from '@/components/client/ProgressBar';

const createClientInfoSchema = (t: TFunction, isCoworking: boolean, pmsGuestLookup: boolean, isExternalGuest: boolean, isGiftCard: boolean) => z.object({
  firstName: z.string().min(1, t('info.errors.firstNameRequired')),
  lastName: z.string().min(1, t('info.errors.lastNameRequired')),
  email: z.string()
    .min(1, t('info.errors.emailRequired'))
    .email(t('info.errors.emailInvalid')),
  phone: z.string()
    .min(1, t('info.errors.phoneRequired'))
    .min(6, t('info.errors.phoneInvalid')),
  countryCode: z.string(),
  roomNumber: (isGiftCard || isCoworking || isExternalGuest) ? z.string().optional() : (pmsGuestLookup ? z.string().optional() : z.string().min(1, t('info.errors.roomRequired'))),
  note: z.string().optional(),
});

type ClientInfoFormData = z.infer<ReturnType<typeof createClientInfoSchema>>;

const countries = [
  { code: "+33", label: "France", flag: "FR" },
  { code: "+971", label: "UAE", flag: "AE" },
  { code: "+1", label: "USA", flag: "US" },
  { code: "+44", label: "UK", flag: "GB" },
  { code: "+49", label: "Germany", flag: "DE" },
  { code: "+39", label: "Italy", flag: "IT" },
  { code: "+34", label: "Spain", flag: "ES" },
  { code: "+41", label: "Switzerland", flag: "CH" },
  { code: "+32", label: "Belgium", flag: "BE" },
  { code: "+377", label: "Monaco", flag: "MC" },
  { code: "+31", label: "Netherlands", flag: "NL" },
  { code: "+351", label: "Portugal", flag: "PT" },
  { code: "+43", label: "Austria", flag: "AT" },
  { code: "+46", label: "Sweden", flag: "SE" },
  { code: "+47", label: "Norway", flag: "NO" },
  { code: "+45", label: "Denmark", flag: "DK" },
  { code: "+358", label: "Finland", flag: "FI" },
  { code: "+48", label: "Poland", flag: "PL" },
  { code: "+420", label: "Czech Republic", flag: "CZ" },
  { code: "+30", label: "Greece", flag: "GR" },
  { code: "+353", label: "Ireland", flag: "IE" },
  { code: "+352", label: "Luxembourg", flag: "LU" },
  { code: "+36", label: "Hungary", flag: "HU" },
  { code: "+40", label: "Romania", flag: "RO" },
  { code: "+385", label: "Croatia", flag: "HR" },
  { code: "+7", label: "Russia", flag: "RU" },
  { code: "+81", label: "Japan", flag: "JP" },
  { code: "+86", label: "China", flag: "CN" },
  { code: "+82", label: "South Korea", flag: "KR" },
  { code: "+91", label: "India", flag: "IN" },
  { code: "+55", label: "Brazil", flag: "BR" },
  { code: "+52", label: "Mexico", flag: "MX" },
  { code: "+61", label: "Australia", flag: "AU" },
  { code: "+64", label: "New Zealand", flag: "NZ" },
  { code: "+65", label: "Singapore", flag: "SG" },
  { code: "+852", label: "Hong Kong", flag: "HK" },
  { code: "+966", label: "Saudi Arabia", flag: "SA" },
  { code: "+974", label: "Qatar", flag: "QA" },
  { code: "+212", label: "Morocco", flag: "MA" },
  { code: "+216", label: "Tunisia", flag: "TN" },
  { code: "+27", label: "South Africa", flag: "ZA" },
  { code: "+90", label: "Turkey", flag: "TR" },
  { code: "+972", label: "Israel", flag: "IL" },
  { code: "+62", label: "Indonesia", flag: "ID" },
  { code: "+66", label: "Thailand", flag: "TH" },
  { code: "+60", label: "Malaysia", flag: "MY" },
];

const inputStyles = "h-12 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-lg focus:border-gold-500 focus:ring-gold-500/20";
const labelStyles = "text-gray-500 text-xs uppercase tracking-wider font-medium";

export default function GuestInfo() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');
  const { canProceedToStep, setClientInfo, clientInfo, bookingDateTime, isBundleOnlyPurchase, setGiftInfo, giftInfo, setAuthBundles, authBundles } = useClientFlow();
  const { items, itemCount, isBundleOnly } = useBasket();
  const { createOffertBooking, isCreating } = useCreateOffertBooking(hotelId);
  const isDesktop = useIsDesktop();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [isExternalGuest, setIsExternalGuest] = useState(clientInfo?.isExternalGuest ?? false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!authBundles);
  const treatmentIds = useMemo(() => items.map(i => i.id), [items]);

  // Gift card form state
  const bundleTemplateId = isBundleOnlyPurchase && isBundleOnly ? items.find(i => i.bundleId)?.bundleId ?? null : null;
  const { data: bundleTemplate } = useBundleTemplate(bundleTemplateId);
  const isGiftCardBundle = bundleTemplate?.bundle_type === 'gift_amount' || bundleTemplate?.bundle_type === 'gift_treatments';
  const [giftRecipientName, setGiftRecipientName] = useState(giftInfo?.recipientName ?? '');
  const [giftRecipientEmail, setGiftRecipientEmail] = useState(giftInfo?.recipientEmail ?? '');
  const [giftMessage, setGiftMessage] = useState(giftInfo?.giftMessage ?? '');
  const [giftErrors, setGiftErrors] = useState<Record<string, string>>({});

  // Fetch venue type via RPC (bypasses RLS policies for anonymous users)
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

  const isOffert = !!hotel?.offert;
  const isCompanyOffered = !!hotel?.company_offered;
  const venueType = hotel?.venue_type as VenueType | null;

  // Get venue-specific terminology
  const { locationNumberLabel } = useVenueTerms(venueType);
  const { trackPageView } = useClientAnalytics(hotelId);
  const hasTrackedPageView = useRef(false);

  // Track page view once
  useEffect(() => {
    if (!hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackPageView('guest_info');
    }
  }, [trackPageView]);

  // Auto-close checkout panel if cart is emptied
  useEffect(() => {
    if (itemCount === 0 && isCheckoutOpen) {
      setIsCheckoutOpen(false);
    }
  }, [itemCount, isCheckoutOpen]);

  const isCoworking = venueType === 'coworking' || venueType === 'enterprise';
  const pmsGuestLookupEnabled = !!hotel?.pms_guest_lookup_enabled;
  const schema = useMemo(() => createClientInfoSchema(t, isCoworking, pmsGuestLookupEnabled, isExternalGuest, isGiftCardBundle), [t, isCoworking, pmsGuestLookupEnabled, isExternalGuest, isGiftCardBundle]);

  const form = useForm<ClientInfoFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: clientInfo?.firstName ?? '',
      lastName: clientInfo?.lastName ?? '',
      email: clientInfo?.email ?? '',
      phone: clientInfo?.phone ?? '',
      countryCode: clientInfo?.countryCode ?? '+33',
      roomNumber: clientInfo?.roomNumber ?? '',
      note: clientInfo?.note ?? '',
    },
  });

  // Handle login success: pre-fill form with customer data
  const handleLoginSuccess = useCallback((bundles: Parameters<typeof setAuthBundles>[0], customer: AuthCustomerInfo) => {
    setAuthBundles(bundles);
    setIsLoggedIn(true);

    // Extract country code from phone (e.g. "+33609015021" → countryCode="+33", phone="609015021")
    const phoneStr = customer.phone || '';
    let countryCode = '+33';
    let localPhone = phoneStr;
    if (phoneStr.startsWith('+')) {
      // Match against known country codes (longest first to avoid greedy mismatch)
      const matchedCountry = countries
        .sort((a, b) => b.code.length - a.code.length)
        .find((c) => phoneStr.startsWith(c.code));
      if (matchedCountry) {
        countryCode = matchedCountry.code;
        localPhone = phoneStr.slice(matchedCountry.code.length);
      }
    }

    if (customer.firstName) form.setValue('firstName', customer.firstName);
    if (customer.lastName) form.setValue('lastName', customer.lastName);
    if (customer.email) form.setValue('email', customer.email);
    if (localPhone) form.setValue('phone', localPhone);
    form.setValue('countryCode', countryCode);

    toast.success(t('giftCardLogin.loginSuccess'));
  }, [form, setAuthBundles, t]);

  // PMS guest lookup (auto-fill from Opera Cloud when room number is entered)
  const { lookupGuest, guestData, isLoading: isLookingUpGuest } = usePmsGuestLookup(hotelId);
  const pmsStayDatesRef = useRef<{ checkIn?: string; checkOut?: string }>({});

  const handleRoomNumberBlur = useCallback(async (roomNumber: string) => {
    if (!roomNumber || roomNumber.length === 0) return;

    const result = await lookupGuest(roomNumber);
    if (result?.found && result.guest) {
      // Always overwrite — new room number = new guest
      form.setValue('firstName', result.guest.firstName);
      form.setValue('lastName', result.guest.lastName);
      if (result.guest.email) {
        form.setValue('email', result.guest.email);
      }
      if (result.guest.phone) {
        // Parse country code from PMS phone (e.g. "+46706819856")
        const pmsPhone = result.guest.phone;
        const matchedCountry = countries
          .sort((a, b) => b.code.length - a.code.length) // longest first
          .find((c) => pmsPhone.startsWith(c.code));
        if (matchedCountry) {
          form.setValue('countryCode', matchedCountry.code);
          form.setValue('phone', pmsPhone.slice(matchedCountry.code.length));
        } else {
          form.setValue('countryCode', '');
          form.setValue('phone', pmsPhone);
        }
      }
      pmsStayDatesRef.current = {
        checkIn: result.guest.checkIn,
        checkOut: result.guest.checkOut,
      };
      toast.success(t('guestLookup.found'));
    } else if (result && !result.found) {
      pmsStayDatesRef.current = {};
      toast.info(t('guestLookup.notFound'));
    }
  }, [lookupGuest, form, t]);

  const shouldRedirectToSchedule = !canProceedToStep('info');
  const hasShownRedirectToast = useRef(false);

  useEffect(() => {
    if (shouldRedirectToSchedule && !hasShownRedirectToast.current) {
      hasShownRedirectToast.current = true;
      toast.error(t('datetime.selectDate'));
    }
  }, [shouldRedirectToSchedule, t]);

  if (shouldRedirectToSchedule) {
    return <Navigate to={`/client/${hotelId}/${isBundleOnlyPurchase ? 'treatments' : 'schedule'}`} replace />;
  }

  const onSubmit = async (data: ClientInfoFormData) => {
    // Strip country code prefix from phone if user (or browser autofill) included it
    let cleanPhone = data.phone.replace(/\s/g, '');
    if (cleanPhone.startsWith(data.countryCode)) {
      cleanPhone = cleanPhone.slice(data.countryCode.length);
    } else if (cleanPhone.startsWith('+')) {
      // Strip any international prefix (e.g. user typed +33... with a different code selected)
      cleanPhone = cleanPhone.replace(/^\+\d{1,3}/, '');
    }
    data = { ...data, phone: cleanPhone };

    // Validate gift fields for gift card bundles
    if (isGiftCardBundle) {
      const errors: Record<string, string> = {};
      if (!giftRecipientName.trim()) {
        errors.recipientName = t('info.errors.recipientNameRequired');
      }
      if (!giftRecipientEmail.trim()) {
        errors.recipientEmail = t('info.errors.recipientEmailRequired');
      } else if (giftRecipientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(giftRecipientEmail.trim())) {
        errors.recipientEmail = t('info.errors.recipientEmailInvalid');
      }
      if (Object.keys(errors).length > 0) {
        setGiftErrors(errors);
        return;
      }
      setGiftErrors({});
    }

    setIsSubmitting(true);
    try {
      setClientInfo({
        ...data,
        pmsGuestCheckIn: pmsStayDatesRef.current.checkIn,
        pmsGuestCheckOut: pmsStayDatesRef.current.checkOut,
        isExternalGuest,
      });

      // Save gift info to flow context
      if (isGiftCardBundle) {
        setGiftInfo({
          isGift: true,
          deliveryMode: 'email',
          recipientName: giftRecipientName.trim(),
          recipientEmail: giftRecipientEmail.trim(),
          senderName: `${data.firstName} ${data.lastName}`.trim(),
          giftMessage: giftMessage.trim() || undefined,
        });
      } else {
        setGiftInfo(null);
      }

      if (isDesktop) {
        setIsCheckoutOpen(true);
      } else {
        if ((isOffert || isCompanyOffered) && bookingDateTime) {
          await createOffertBooking(data, bookingDateTime);
        } else {
          navigate(`/client/${hotelId}/payment`);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCountries = countries.filter(
    (c) =>
      c.label.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.code.includes(countrySearch)
  );

  // Strip country code prefix from phone input (handles browser autofill inserting full international number)
  const handlePhoneChange = useCallback((value: string, onChange: (v: string) => void) => {
    let clean = value.replace(/\s/g, '');
    const currentCode = form.getValues('countryCode');
    if (clean.startsWith(currentCode)) {
      clean = clean.slice(currentCode.length);
    } else if (clean.startsWith('+')) {
      clean = clean.replace(/^\+\d{1,3}/, '');
    }
    onChange(clean);
  }, [form]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200 pt-safe">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="text-gray-900 hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-light text-gray-900">{t('info.title')}</h1>
          </div>
          {itemCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCartOpen(true)}
              className="relative text-gray-900 hover:bg-gray-100 hover:text-gold-600 transition-colors"
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 bg-gold-600 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                {itemCount}
              </span>
            </Button>
          )}
        </div>
        <ProgressBar currentStep="guest-info" isBundleOnly={isBundleOnlyPurchase} />
      </div>

      {/* Main content — split layout on desktop */}
      <div className="flex-1 flex lg:flex-row overflow-hidden">
        {/* Left panel — guest info form */}
        <div className={cn(
          "flex-1 overflow-y-auto",
          isDesktop && isCheckoutOpen && "pointer-events-none opacity-50 select-none transition-opacity duration-300"
        )}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 py-4 sm:px-6 sm:py-6 space-y-8 pb-32">
              {isGiftCardBundle ? (
                <>
                  {/* Gift card layout — recipient first, buyer second */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Gift className="h-4 w-4 text-rose-500" />
                      <h3 className="text-[10px] uppercase tracking-[0.3em] text-rose-500 font-semibold">
                        {t('info.stepLabel')}
                      </h3>
                    </div>
                    <h2 className="font-serif text-xl sm:text-2xl text-gray-900 leading-tight">
                      {t('info.giftHeadline')}
                    </h2>
                  </div>

                  {/* Recipient section */}
                  <div className="space-y-4 p-4 bg-rose-50/50 rounded-xl border border-rose-100">
                    {/* Recipient name */}
                    <div>
                      <label className={labelStyles}>{t('info.recipientName')}</label>
                      <Input
                        value={giftRecipientName}
                        onChange={(e) => { setGiftRecipientName(e.target.value); setGiftErrors(prev => ({ ...prev, recipientName: '' })); }}
                        placeholder="Marie Dupont"
                        className={cn(inputStyles, "bg-white", giftErrors.recipientName && "border-red-400")}
                      />
                      {giftErrors.recipientName && <p className="text-red-400 text-xs mt-1">{giftErrors.recipientName}</p>}
                    </div>

                    {/* Recipient email */}
                    <div>
                        <label className={labelStyles}>{t('info.recipientEmail')}</label>
                        <Input
                          value={giftRecipientEmail}
                          onChange={(e) => { setGiftRecipientEmail(e.target.value); setGiftErrors(prev => ({ ...prev, recipientEmail: '' })); }}
                          type="email"
                          placeholder="marie@example.com"
                          className={cn(inputStyles, "bg-white", giftErrors.recipientEmail && "border-red-400")}
                          autoComplete="off"
                        />
                        {(() => {
                          const emailValue = giftRecipientEmail;
                          const atIndex = emailValue.indexOf('@');
                          const localPart = atIndex >= 0 ? emailValue.slice(0, atIndex) : emailValue;
                          const domainPart = atIndex >= 0 ? emailValue.slice(atIndex + 1) : '';
                          const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'orange.fr', 'free.fr', 'sfr.fr'];
                          const showSuggestions = localPart.length >= 2 && (atIndex === -1 || (atIndex >= 0 && domainPart.length > 0 && !domains.includes(domainPart)));
                          const filtered = atIndex >= 0
                            ? domains.filter(d => d.startsWith(domainPart))
                            : domains;
                          return showSuggestions && filtered.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {filtered.slice(0, 3).map(domain => (
                                <button
                                  key={domain}
                                  type="button"
                                  onClick={() => { setGiftRecipientEmail(`${localPart}@${domain}`); setGiftErrors(prev => ({ ...prev, recipientEmail: '' })); }}
                                  className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                                >
                                  @{domain}
                                </button>
                              ))}
                            </div>
                          ) : null;
                        })()}
                        {giftErrors.recipientEmail && <p className="text-red-400 text-xs mt-1">{giftErrors.recipientEmail}</p>}
                    </div>

                    {/* Gift message */}
                    <div>
                      <label className={labelStyles}>{t('info.giftMessage')}</label>
                      <Textarea
                        value={giftMessage}
                        onChange={(e) => setGiftMessage(e.target.value.slice(0, 200))}
                        placeholder={t('info.giftMessagePlaceholder')}
                        className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-lg focus:border-rose-500 focus:ring-rose-500/20 resize-none"
                        rows={3}
                      />
                      <p className="text-xs text-gray-400 mt-1 text-right">{giftMessage.length}/200</p>
                    </div>
                  </div>

                  {/* Buyer section divider */}
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-600 mb-4 font-semibold">
                      {t('info.purchaserSection')}
                    </h3>
                  </div>

                  {/* Buyer fields — minimal: name + email + phone */}
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={labelStyles}>{t('info.firstName')}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="John" className={inputStyles} />
                            </FormControl>
                            <FormMessage className="text-red-400 text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={labelStyles}>{t('info.lastName')}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Doe" className={inputStyles} />
                            </FormControl>
                            <FormMessage className="text-red-400 text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => {
                        const emailValue = field.value || '';
                        const atIndex = emailValue.indexOf('@');
                        const localPart = atIndex >= 0 ? emailValue.slice(0, atIndex) : emailValue;
                        const domainPart = atIndex >= 0 ? emailValue.slice(atIndex + 1) : '';
                        const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'orange.fr', 'free.fr', 'sfr.fr'];
                        const showSuggestions = localPart.length >= 2 && (atIndex === -1 || (atIndex >= 0 && domainPart.length > 0 && !domains.includes(domainPart)));
                        const filtered = atIndex >= 0
                          ? domains.filter(d => d.startsWith(domainPart))
                          : domains;

                        return (
                          <FormItem>
                            <FormLabel className={labelStyles}>{t('info.email')}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                placeholder="john.doe@example.com"
                                className={inputStyles}
                                autoComplete="off"
                              />
                            </FormControl>
                            {showSuggestions && filtered.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {filtered.slice(0, 3).map(domain => (
                                  <button
                                    key={domain}
                                    type="button"
                                    onClick={() => field.onChange(`${localPart}@${domain}`)}
                                    className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                                  >
                                    @{domain}
                                  </button>
                                ))}
                              </div>
                            )}
                            <FormMessage className="text-red-400 text-xs" />
                          </FormItem>
                        );
                      }}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={labelStyles}>{t('info.phone')}</FormLabel>
                          <FormControl>
                            <div className="flex h-12 w-full items-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 focus-within:border-gold-500 focus-within:ring-1 focus-within:ring-gold-500/20">
                              <Popover open={countryPopoverOpen} onOpenChange={setCountryPopoverOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-full rounded-none border-r border-gray-200 px-3 font-normal text-sm text-gray-900 hover:bg-gray-100 hover:text-gray-900"
                                    aria-expanded={countryPopoverOpen}
                                  >
                                    <span className="tabular-nums">{form.watch('countryCode')}</span>
                                    <ChevronDown className="ml-1 h-3 w-3 shrink-0 text-gray-400" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="start"
                                  className="w-[calc(100vw-2rem)] sm:w-56 p-0 border border-gray-200 shadow-lg z-50 bg-white"
                                >
                                  <div className="p-2 border-b border-gray-200">
                                    <Input
                                      placeholder="Search..."
                                      value={countrySearch}
                                      onChange={(e) => setCountrySearch(e.target.value)}
                                      className="h-8 text-sm bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
                                    />
                                  </div>
                                  <ScrollArea className="h-48 sm:h-40">
                                    {filteredCountries.map((country) => (
                                      <button
                                        key={country.code}
                                        type="button"
                                        onClick={() => {
                                          form.setValue('countryCode', country.code);
                                          setCountryPopoverOpen(false);
                                          setCountrySearch("");
                                        }}
                                        className={cn(
                                          "flex w-full items-center px-3 py-2 text-sm text-gray-900 hover:bg-gray-100",
                                          form.watch('countryCode') === country.code && "bg-gold-500/10 text-gold-600"
                                        )}
                                      >
                                        <span className="w-8 shrink-0 text-xs text-gray-400 uppercase">
                                          {country.flag}
                                        </span>
                                        <span className="flex-1 text-left">{country.label}</span>
                                        <span className="ml-2 shrink-0 tabular-nums text-gray-400">
                                          {country.code}
                                        </span>
                                      </button>
                                    ))}
                                    {filteredCountries.length === 0 && (
                                      <div className="px-3 py-2 text-sm text-gray-400">
                                        No results
                                      </div>
                                    )}
                                  </ScrollArea>
                                </PopoverContent>
                              </Popover>
                              <Input
                                id="phone"
                                value={field.value}
                                onChange={(e) => handlePhoneChange(e.target.value, field.onChange)}
                                onBlur={() => {}}
                                placeholder="612345678"
                                className="h-full flex-1 border-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                              />
                            </div>
                          </FormControl>
                          <FormMessage className="text-red-400 text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Standard layout — regular bookings and cures */}
                  <div>
                    <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-600 mb-3 font-semibold">
                      {t('info.stepLabel')}
                    </h3>
                    <h2 className="font-serif text-xl sm:text-2xl text-gray-900 leading-tight">
                      {t('info.headline')}
                    </h2>
                  </div>

                  {/* Login CTA for gift card / cure holders */}
                  {!isBundleOnlyPurchase && !isLoggedIn && (
                    <button
                      type="button"
                      onClick={() => setLoginModalOpen(true)}
                      className="w-full p-3.5 rounded-xl border border-dashed border-amber-200 bg-amber-50/50 hover:border-amber-300 transition-all text-left flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <LogIn className="w-4 h-4 text-amber-700" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-amber-900">{t('giftCardLogin.cta')}</p>
                        <p className="text-xs text-amber-700/70">{t('giftCardLogin.ctaSubtitlePrefill')}</p>
                      </div>
                    </button>
                  )}

                  {isLoggedIn && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <p className="text-sm text-emerald-700">{t('giftCardLogin.loggedIn')}</p>
                    </div>
                  )}

                  {/* Form fields */}
                  <div className="space-y-5">
                    {/* Room number FIRST when PMS guest lookup is enabled */}
                    {!isCoworking && pmsGuestLookupEnabled && (
                      <div className="space-y-3">
                        {!isExternalGuest && (
                          <FormField
                            control={form.control}
                            name="roomNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelStyles}>{locationNumberLabel} <span className="normal-case tracking-normal font-normal text-gray-400">({t('guestLookup.optional')})</span></FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      {...field}
                                      onBlur={(e) => {
                                        field.onBlur();
                                        handleRoomNumberBlur(e.target.value);
                                      }}
                                      placeholder="102"
                                      className={inputStyles}
                                    />
                                    {isLookingUpGuest && (
                                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gold-600" />
                                    )}
                                    {guestData?.found && !isLookingUpGuest && (
                                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                                    )}
                                  </div>
                                </FormControl>
                                <p className="text-xs text-gray-400 mt-1">{t('guestLookup.hint')}</p>
                                <FormMessage className="text-red-400 text-xs" />
                              </FormItem>
                            )}
                          />
                        )}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isExternalGuest}
                            onChange={(e) => {
                              setIsExternalGuest(e.target.checked);
                              if (e.target.checked) {
                                form.setValue('roomNumber', '');
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-500"
                          />
                          <span className="text-sm text-gray-500">{t('info.notHotelGuest')}</span>
                        </label>
                      </div>
                    )}

                    {/* Name row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={labelStyles}>{t('info.firstName')}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="John"
                                className={inputStyles}
                              />
                            </FormControl>
                            <FormMessage className="text-red-400 text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={labelStyles}>{t('info.lastName')}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Doe"
                                className={inputStyles}
                              />
                            </FormControl>
                            <FormMessage className="text-red-400 text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Email with domain suggestions */}
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => {
                        const emailValue = field.value || '';
                        const atIndex = emailValue.indexOf('@');
                        const localPart = atIndex >= 0 ? emailValue.slice(0, atIndex) : emailValue;
                        const domainPart = atIndex >= 0 ? emailValue.slice(atIndex + 1) : '';
                        const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'orange.fr', 'free.fr', 'sfr.fr'];
                        const showSuggestions = localPart.length >= 2 && (atIndex === -1 || (atIndex >= 0 && domainPart.length > 0 && !domains.includes(domainPart)));
                        const filtered = atIndex >= 0
                          ? domains.filter(d => d.startsWith(domainPart))
                          : domains;

                        return (
                          <FormItem>
                            <FormLabel className={labelStyles}>{t('info.email')}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                placeholder="john.doe@example.com"
                                className={inputStyles}
                                autoComplete="off"
                              />
                            </FormControl>
                            {showSuggestions && filtered.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {filtered.slice(0, 3).map(domain => (
                                  <button
                                    key={domain}
                                    type="button"
                                    onClick={() => field.onChange(`${localPart}@${domain}`)}
                                    className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                                  >
                                    @{domain}
                                  </button>
                                ))}
                              </div>
                            )}
                            <FormMessage className="text-red-400 text-xs" />
                          </FormItem>
                        );
                      }}
                    />

                    {/* Phone with country selector */}
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={labelStyles}>{t('info.phone')}</FormLabel>
                          <FormControl>
                            <div className="flex h-12 w-full items-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 focus-within:border-gold-500 focus-within:ring-1 focus-within:ring-gold-500/20">
                              <Popover open={countryPopoverOpen} onOpenChange={setCountryPopoverOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-full rounded-none border-r border-gray-200 px-3 font-normal text-sm text-gray-900 hover:bg-gray-100 hover:text-gray-900"
                                    aria-expanded={countryPopoverOpen}
                                  >
                                    <span className="tabular-nums">{form.watch('countryCode')}</span>
                                    <ChevronDown className="ml-1 h-3 w-3 shrink-0 text-gray-400" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="start"
                                  className="w-[calc(100vw-2rem)] sm:w-56 p-0 border border-gray-200 shadow-lg z-50 bg-white"
                                >
                                  <div className="p-2 border-b border-gray-200">
                                    <Input
                                      placeholder="Search..."
                                      value={countrySearch}
                                      onChange={(e) => setCountrySearch(e.target.value)}
                                      className="h-8 text-sm bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
                                    />
                                  </div>
                                  <ScrollArea className="h-48 sm:h-40">
                                    {filteredCountries.map((country) => (
                                      <button
                                        key={country.code}
                                        type="button"
                                        onClick={() => {
                                          form.setValue('countryCode', country.code);
                                          setCountryPopoverOpen(false);
                                          setCountrySearch("");
                                        }}
                                        className={cn(
                                          "flex w-full items-center px-3 py-2 text-sm text-gray-900 hover:bg-gray-100",
                                          form.watch('countryCode') === country.code && "bg-gold-500/10 text-gold-600"
                                        )}
                                      >
                                        <span className="w-8 shrink-0 text-xs text-gray-400 uppercase">
                                          {country.flag}
                                        </span>
                                        <span className="flex-1 text-left">{country.label}</span>
                                        <span className="ml-2 shrink-0 tabular-nums text-gray-400">
                                          {country.code}
                                        </span>
                                      </button>
                                    ))}
                                    {filteredCountries.length === 0 && (
                                      <div className="px-3 py-2 text-sm text-gray-400">
                                        No results
                                      </div>
                                    )}
                                  </ScrollArea>
                                </PopoverContent>
                              </Popover>
                              <Input
                                id="phone"
                                value={field.value}
                                onChange={(e) => handlePhoneChange(e.target.value, field.onChange)}
                                onBlur={() => {}}
                                placeholder="612345678"
                                className="h-full flex-1 border-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                              />
                            </div>
                          </FormControl>
                          <FormMessage className="text-red-400 text-xs" />
                        </FormItem>
                      )}
                    />

                    {/* Room number - classic position when PMS lookup is NOT enabled */}
                    {!isCoworking && !pmsGuestLookupEnabled && (
                      <div className="space-y-3">
                        {!isExternalGuest && (
                          <FormField
                            control={form.control}
                            name="roomNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelStyles}>{locationNumberLabel}</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      {...field}
                                      onBlur={(e) => {
                                        field.onBlur();
                                        handleRoomNumberBlur(e.target.value);
                                      }}
                                      placeholder="102"
                                      className={inputStyles}
                                    />
                                    {isLookingUpGuest && (
                                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gold-600" />
                                    )}
                                    {guestData?.found && !isLookingUpGuest && (
                                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                                    )}
                                  </div>
                                </FormControl>
                                <FormMessage className="text-red-400 text-xs" />
                              </FormItem>
                            )}
                          />
                        )}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isExternalGuest}
                            onChange={(e) => {
                              setIsExternalGuest(e.target.checked);
                              if (e.target.checked) {
                                form.setValue('roomNumber', '');
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-500"
                          />
                          <span className="text-sm text-gray-500">{t('info.notHotelGuest')}</span>
                        </label>
                      </div>
                    )}

                    {/* Note */}
                    <FormField
                      control={form.control}
                      name="note"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={labelStyles}>{t('info.note')}</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder={t('info.notePlaceholder')}
                              className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-lg focus:border-gold-500 focus:ring-gold-500/20 resize-none"
                              rows={3}
                            />
                          </FormControl>
                          <FormMessage className="text-red-400 text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

              {/* Fixed Bottom Button — hide when checkout panel is open on desktop */}
              {!(isDesktop && isCheckoutOpen) && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pb-safe z-30">
                  <Button
                    type="submit"
                    disabled={isSubmitting || isCreating}
                    className="w-full h-12 sm:h-14 md:h-16 bg-gray-900 text-white hover:bg-gray-800 font-medium tracking-widest text-base transition-all duration-300 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    {(isSubmitting || isCreating) ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {isCreating ? t('payment.processing') : t('common:loading')}
                      </>
                    ) : (
                      t('info.continue')
                    )}
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </div>

        {/* Right panel — checkout recap (desktop only) */}
        {isDesktop && (
          <div
            className={cn(
              "shrink-0 border-l border-gray-200 bg-gray-50/50 transition-all duration-300 ease-in-out",
              isCheckoutOpen
                ? "w-[480px] opacity-100 overflow-y-auto"
                : "w-0 opacity-0 overflow-hidden border-l-0"
            )}
          >
            {/* Back button — return to form editing */}
            <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCheckoutOpen(false)}
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-200/50 font-grotesk"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('checkoutPanel.editInfo')}
              </Button>
            </div>
            <CheckoutPanel
              hotelId={hotelId!}
              onBack={() => setIsCheckoutOpen(false)}
              embedded
            />
          </div>
        )}
      </div>

      {/* Cart Drawer */}
      <CartDrawer open={isCartOpen} onOpenChange={setIsCartOpen} />

      {/* Gift card login modal */}
      <GiftCardLoginModal
        open={loginModalOpen}
        onOpenChange={setLoginModalOpen}
        hotelId={hotelId || ''}
        treatmentIds={treatmentIds}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}
