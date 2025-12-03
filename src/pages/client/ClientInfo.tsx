import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import BookingProgressBar from '@/components/BookingProgressBar';

export default function ClientInfo() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    countryCode: '+33',
    email: '',
    roomNumber: '',
  });

  const countryCodes = [
    { code: '+33', country: '🇫🇷 France' },
    { code: '+1', country: '🇺🇸 USA' },
    { code: '+44', country: '🇬🇧 UK' },
    { code: '+49', country: '🇩🇪 Germany' },
    { code: '+34', country: '🇪🇸 Spain' },
    { code: '+39', country: '🇮🇹 Italy' },
    { code: '+971', country: '🇦🇪 UAE' },
  ];

  useEffect(() => {
    const dateTime = sessionStorage.getItem('bookingDateTime');
    if (!dateTime) {
      toast.error(t('datetime.selectDate'));
      navigate(`/client/${hotelId}/datetime`);
    }
  }, [hotelId, navigate, t]);

  const handleContinue = () => {
    if (!formData.firstName || !formData.lastName || !formData.phone || 
        !formData.email || !formData.roomNumber) {
      toast.error(t('common:errors.required'));
      return;
    }

    sessionStorage.setItem('clientInfo', JSON.stringify(formData));
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
            <div className="flex gap-2">
              <Select
                value={formData.countryCode}
                onValueChange={(value) => setFormData(prev => ({ ...prev, countryCode: value }))}
              >
                <SelectTrigger className="w-28 h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  {countryCodes.map(({ code, country }) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="612345678"
                className="flex-1 h-12 rounded-xl"
                required
              />
            </div>
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
