import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, ChevronDown, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { toast } from 'sonner';
import { useClientFlow } from './context/FlowContext';
import { useBasket } from './context/CartContext';
import { useCreateOffertBooking } from './hooks/useCreateOffertBooking';
import { CartDrawer } from '@/components/client/CartDrawer';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useVenueTerms, VenueType } from '@/hooks/useVenueTerms';
import { useClientAnalytics } from '@/hooks/useClientAnalytics';
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

const createClientInfoSchema = (t: TFunction, isCoworking: boolean) => z.object({
  firstName: z.string().min(1, t('info.errors.firstNameRequired')),
  lastName: z.string().min(1, t('info.errors.lastNameRequired')),
  email: z.string()
    .min(1, t('info.errors.emailRequired'))
    .email(t('info.errors.emailInvalid')),
  phone: z.string()
    .min(1, t('info.errors.phoneRequired'))
    .min(6, t('info.errors.phoneInvalid')),
  countryCode: z.string(),
  roomNumber: isCoworking ? z.string().optional() : z.string().min(1, t('info.errors.roomRequired')),
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
];

const inputStyles = "h-12 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-lg focus:border-gold-400 focus:ring-gold-400/20";
const labelStyles = "text-gray-500 text-xs uppercase tracking-wider font-medium";

export default function GuestInfo() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');
  const { canProceedToStep, setClientInfo, bookingDateTime } = useClientFlow();
  const { itemCount } = useBasket();
  const { createOffertBooking, isCreating } = useCreateOffertBooking(hotelId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

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

  const isCoworking = venueType === 'coworking' || venueType === 'enterprise';
  const schema = useMemo(() => createClientInfoSchema(t, isCoworking), [t, isCoworking]);

  const form = useForm<ClientInfoFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      countryCode: '+33',
      roomNumber: '',
      note: '',
    },
  });

  useEffect(() => {
    if (!canProceedToStep('info')) {
      toast.error(t('datetime.selectDate'));
      navigate(`/client/${hotelId}/schedule`);
    }
  }, [hotelId, navigate, t, canProceedToStep]);

  const onSubmit = async (data: ClientInfoFormData) => {
    setIsSubmitting(true);
    try {
      setClientInfo(data);
      if ((isOffert || isCompanyOffered) && bookingDateTime) {
        await createOffertBooking(data, bookingDateTime);
      } else {
        navigate(`/client/${hotelId}/payment`);
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

  return (
    <div className="relative min-h-[100dvh] w-full bg-white pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 pt-safe">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/client/${hotelId}/schedule`)}
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
              className="relative text-gray-900 hover:bg-gray-100 hover:text-gold-400 transition-colors"
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 bg-gold-400 text-black text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                {itemCount}
              </span>
            </Button>
          )}
        </div>
        <ProgressBar currentStep="guest-info" />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 py-4 sm:px-6 sm:py-6 space-y-8 pb-32">
          {/* Page headline */}
          <div className="animate-fade-in">
            <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-400 mb-3 font-semibold">
              {t('info.stepLabel')}
            </h3>
            <h2 className="font-serif text-xl sm:text-2xl text-gray-900 leading-tight">
              {t('info.headline')}
            </h2>
          </div>

          {/* Form fields */}
          <div className="space-y-5 animate-fade-in" style={{ animationDelay: '0.1s' }}>
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

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelStyles}>{t('info.email')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="john.doe@example.com"
                      className={inputStyles}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )}
            />

            {/* Phone with country selector */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelStyles}>{t('info.phone')}</FormLabel>
                  <FormControl>
                    <div className="flex h-12 w-full items-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 focus-within:border-gold-400 focus-within:ring-1 focus-within:ring-gold-400/20">
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
                                  form.watch('countryCode') === country.code && "bg-gold-400/10 text-gold-400"
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
                        onChange={(e) => field.onChange(e.target.value)}
                        placeholder="612345678"
                        className="h-full flex-1 border-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )}
            />

            {/* Room number - hidden for coworking */}
            {!isCoworking && (
              <FormField
                control={form.control}
                name="roomNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelStyles}>{locationNumberLabel}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="102"
                        className={inputStyles}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />
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
                      className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-lg focus:border-gold-400 focus:ring-gold-400/20 resize-none"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )}
            />
          </div>

          {/* Fixed Bottom Button */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pb-safe">
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
        </form>
      </Form>

      {/* Cart Drawer */}
      <CartDrawer open={isCartOpen} onOpenChange={setIsCartOpen} />
    </div>
  );
}
