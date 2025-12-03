import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';

export default function ClientConfirmation() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Success Checkmark */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
            <div className="relative bg-green-500/10 rounded-full p-6">
              <CheckCircle2 className="h-16 w-16 text-green-600" strokeWidth={2.5} />
            </div>
          </div>
        </div>
        
        {/* Success Message */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">
            {t('confirmation.title')}
          </h1>
          
          <p className="text-muted-foreground leading-relaxed px-4">
            {t('confirmation.message')}
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-8">
          <Button
            onClick={() => navigate(`/client/${hotelId}`)}
            className="w-full h-14 text-base rounded-full"
            size="lg"
          >
            {t('confirmation.backHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}
