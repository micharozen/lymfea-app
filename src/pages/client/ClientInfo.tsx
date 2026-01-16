import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhoneNumberField } from '@/components/PhoneNumberField';
import { ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import BookingProgressBar from '@/components/BookingProgressBar';
import { useClientFlow } from './context/ClientFlowContext';

export default function ClientInfo() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');
  const { canProceedToStep, setClientInfo } = useClientFlow();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    countryCode: '+33',
    email: '',
    roomNumber: '',
    note: '',
  });

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

  useEffect(() => {
    if (!canProceedToStep('info')) {
      toast.error(t('datetime.selectDate'));
      navigate(`/client/${hotelId}/datetime`);
    }
  }, [hotelId, navigate, t, canProceedToStep]);

  const handleContinue = () => {
    if (!formData.firstName || !formData.lastName || !formData.phone || 
        !formData.email || !formData.roomNumber) {
      toast.error(t('common:errors.required'));
      return;
    }

    setClientInfo(formData);
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

      <div className="p-4 space-y-5">
        {/* Personal Information */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm">{t('info.firstName')}</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                placeholder="John"
                required
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm">{t('info.lastName')}</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                placeholder="Doe"
                required
                className="h-12 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm">{t('info.email')}</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="john.doe@example.com"
              required
              className="h-12 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm">{t('info.phone')}</Label>
            <PhoneNumberField
              id="phone"
              value={formData.phone}
              onChange={(value) => setFormData(prev => ({ ...prev, phone: value }))}
              countryCode={formData.countryCode}
              setCountryCode={(value) => setFormData(prev => ({ ...prev, countryCode: value }))}
              countries={countries}
              placeholder="612345678"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="roomNumber" className="text-sm">{t('info.roomNumber')}</Label>
            <Input
              id="roomNumber"
              value={formData.roomNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, roomNumber: e.target.value }))}
              placeholder="102"
              required
              className="h-12 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note" className="text-sm">{t('info.note', 'Note (optional)')}</Label>
            <Textarea
              id="note"
              value={formData.note}
              onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
              placeholder={t('info.notePlaceholder', 'Any special requests or information...')}
              className="rounded-xl resize-none"
              rows={3}
            />
          </div>
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border pb-safe">
        <Button
          onClick={handleContinue}
          className="w-full h-14 text-base rounded-full"
        >
          {t('info.continue')}
        </Button>
      </div>
    </div>
  );
}
