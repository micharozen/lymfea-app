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
import { ArrowLeft, Loader2, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { toast } from 'sonner';
import { useClientFlow } from './context/FlowContext';
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

// Dark themed input styles
const darkInputStyles = "h-12 bg-white/5 border-white/20 text-white placeholder:text-white/30 rounded-lg focus:border-gold-400 focus:ring-gold-400/20";
const darkLabelStyles = "text-white/60 text-xs uppercase tracking-wider font-medium";

export default function GuestInfo() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');
  const { canProceedToStep, setClientInfo } = useClientFlow();
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      navigate(`/client/${hotelId}/payment`);
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
    <div className="relative min-h-[100dvh] w-full bg-black pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-sm border-b border-white/10 pt-safe">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/schedule`)}
            className="text-white hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-light text-white">{t('info.title')}</h1>
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
            <h2 className="font-serif text-xl sm:text-2xl text-white leading-tight">
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
                    <FormLabel className={darkLabelStyles}>{t('info.firstName')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="John"
                        className={darkInputStyles}
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
                    <FormLabel className={darkLabelStyles}>{t('info.lastName')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Doe"
                        className={darkInputStyles}
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
                  <FormLabel className={darkLabelStyles}>{t('info.email')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="john.doe@example.com"
                      className={darkInputStyles}
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
                  <FormLabel className={darkLabelStyles}>{t('info.phone')}</FormLabel>
                  <FormControl>
                    <div className="flex h-12 w-full items-center overflow-hidden rounded-lg border border-white/20 bg-white/5 focus-within:border-gold-400 focus-within:ring-1 focus-within:ring-gold-400/20">
                      <Popover open={countryPopoverOpen} onOpenChange={setCountryPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-full rounded-none border-r border-white/20 px-3 font-normal text-sm text-white hover:bg-white/10 hover:text-white"
                            aria-expanded={countryPopoverOpen}
                          >
                            <span className="tabular-nums">{form.watch('countryCode')}</span>
                            <ChevronDown className="ml-1 h-3 w-3 shrink-0 text-white/50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[calc(100vw-2rem)] sm:w-56 p-0 border border-white/20 shadow-lg z-50 bg-black"
                        >
                          <div className="p-2 border-b border-white/10">
                            <Input
                              placeholder="Search..."
                              value={countrySearch}
                              onChange={(e) => setCountrySearch(e.target.value)}
                              className="h-8 text-sm bg-white/5 border-white/20 text-white placeholder:text-white/30"
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
                                  "flex w-full items-center px-3 py-2 text-sm text-white hover:bg-white/10",
                                  form.watch('countryCode') === country.code && "bg-gold-400/10 text-gold-400"
                                )}
                              >
                                <span className="w-8 shrink-0 text-xs text-white/50 uppercase">
                                  {country.flag}
                                </span>
                                <span className="flex-1 text-left">{country.label}</span>
                                <span className="ml-2 shrink-0 tabular-nums text-white/50">
                                  {country.code}
                                </span>
                              </button>
                            ))}
                            {filteredCountries.length === 0 && (
                              <div className="px-3 py-2 text-sm text-white/40">
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
                        className="h-full flex-1 border-0 bg-transparent text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
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
                    <FormLabel className={darkLabelStyles}>{locationNumberLabel}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="102"
                        className={darkInputStyles}
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
                  <FormLabel className={darkLabelStyles}>{t('info.note')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={t('info.notePlaceholder')}
                      className="bg-white/5 border-white/20 text-white placeholder:text-white/30 rounded-lg focus:border-gold-400 focus:ring-gold-400/20 resize-none"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )}
            />
          </div>

          {/* Fixed Bottom Button */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black to-transparent pb-safe">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 sm:h-14 md:h-16 bg-white text-black hover:bg-gold-50 font-medium tracking-widest text-base rounded-none transition-all duration-300 disabled:bg-white/20 disabled:text-white/40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common:loading')}
                </>
              ) : (
                t('info.continue')
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
