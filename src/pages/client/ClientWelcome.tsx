import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import oomLogo from '@/assets/oom-monogram-white-client.svg';
import welcomeBg from '@/assets/welcome-bg-couple.jpg';

export default function ClientWelcome() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('client');

  const { data: hotel, isLoading } = useQuery({
    queryKey: ['hotel', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotels')
        .select('*')
        .eq('id', hotelId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!hotelId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('common:loading')}</p>
        </div>
      </div>
    );
  }

  if (!hotel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">{t('hotelNotFound')}</h1>
          <p className="text-muted-foreground">{t('checkQrCode')}</p>
        </div>
      </div>
    );
  }

  const bgImageUrl = welcomeBg;

  return (
    <div 
      className="h-screen bg-cover bg-center relative flex flex-col overflow-hidden"
      style={{ backgroundImage: `url(${bgImageUrl})` }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />
      
      {/* Language Switcher - Mobile friendly pill style */}
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher variant="client" />
      </div>
      
      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-between p-6 text-center">
        {/* Logo */}
        <div className="pt-8 flex-shrink-0">
          <img src={oomLogo} alt="OOM" className="h-16 w-16 mx-auto mb-6 animate-fade-in" />
          <h1 className="text-white text-3xl font-kormelink animate-fade-in">
            {hotel.name}
          </h1>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col justify-center max-w-md animate-fade-in">
          <h2 className="text-white text-2xl font-semibold mb-3">
            {t('welcome.beautyRoomService')}
          </h2>
          <p className="text-white/90 text-base mb-0 leading-relaxed">
            {t('welcome.description')}
          </p>
        </div>

        {/* Buttons */}
        <div className="w-full max-w-md space-y-3 pb-8 flex-shrink-0 animate-fade-in">
          <Button
            onClick={() => navigate(`/client/${hotelId}/menu?gender=women`)}
            className="w-full h-12 text-base bg-white text-primary hover:bg-white/90 transition-all duration-300 hover:scale-[1.02]"
          >
            {t('welcome.womensMenu')}
          </Button>
          <Button
            onClick={() => navigate(`/client/${hotelId}/menu?gender=men`)}
            variant="outline"
            className="w-full h-12 text-base bg-transparent border-2 border-white text-white hover:bg-white/10 transition-all duration-300 hover:scale-[1.02]"
          >
            {t('welcome.mensMenu')}
          </Button>
        </div>
      </div>
    </div>
  );
}
