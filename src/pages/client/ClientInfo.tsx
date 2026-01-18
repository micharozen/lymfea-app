import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PhoneNumberField } from '@/components/PhoneNumberField';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import BookingProgressBar from '@/components/BookingProgressBar';
import { useClientFlow } from './context/ClientFlowContext';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const createClientInfoSchema = (t: TFunction) => z.object({
  firstName: z.string().min(1, t('info.errors.firstNameRequired')),
  lastName: z.string().min(1, t('info.errors.lastNameRequired')),
  email: z.string()
    .min(1, t('info.errors.emailRequired'))
    .email(t('info.errors.emailInvalid')),
  phone: z.string()
    .min(1, t('info.errors.phoneRequired'))
    .min(6, t('info.errors.phoneInvalid')),
  countryCode: z.string(),
  roomNumber: z.string().min(1, t('info.errors.roomRequired')),
  note: z.string().optional(),
});

type ClientInfoFormData = z.infer<ReturnType<typeof createClientInfoSchema>>;

const countries = [
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
  { code: "+1", label: "États-Unis", flag: "🇺🇸" },
  { code: "+44", label: "Royaume-Uni", flag: "🇬🇧" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+377", label: "Monaco", flag: "🇲🇨" },
];

export default function ClientInfo() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');
  const { canProceedToStep, setClientInfo } = useClientFlow();

  const schema = useMemo(() => createClientInfoSchema(t), [t]);

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
      navigate(`/client/${hotelId}/datetime`);
    }
  }, [hotelId, navigate, t, canProceedToStep]);

  const onSubmit = (data: ClientInfoFormData) => {
    setClientInfo(data);
    navigate(`/client/${hotelId}/payment`);
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border pt-safe">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/datetime`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">{t('info.title')}</h1>
        </div>
        <BookingProgressBar currentStep={3} totalSteps={4} />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 space-y-5">
          {/* Personal Information */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">{t('info.firstName')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="John"
                        className="h-12 rounded-xl"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">{t('info.lastName')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Doe"
                        className="h-12 rounded-xl"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">{t('info.email')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="john.doe@example.com"
                      className="h-12 rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">{t('info.phone')}</FormLabel>
                  <FormControl>
                    <PhoneNumberField
                      id="phone"
                      value={field.value}
                      onChange={field.onChange}
                      countryCode={form.watch('countryCode')}
                      setCountryCode={(value) => form.setValue('countryCode', value)}
                      countries={countries}
                      placeholder="612345678"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="roomNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">{t('info.roomNumber')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="102"
                      className="h-12 rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">{t('info.note', 'Note (optional)')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={t('info.notePlaceholder', 'Any special requests or information...')}
                      className="rounded-xl resize-none"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Fixed Bottom Button */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border pb-safe">
            <Button
              type="submit"
              className="w-full h-14 text-base rounded-full"
            >
              {t('info.continue')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
