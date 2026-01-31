import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { PractitionerCard } from './PractitionerCard';

interface Practitioner {
  id: string;
  first_name: string;
  profile_image: string | null;
  skills: string[] | null;
}

interface PractitionerCarouselProps {
  hotelId: string;
}

export function PractitionerCarousel({ hotelId }: PractitionerCarouselProps) {
  const { t } = useTranslation('client');

  const { data: practitioners = [], isLoading } = useQuery({
    queryKey: ['public-hairdressers', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_public_hairdressers', { _hotel_id: hotelId });

      if (error) throw error;
      return (data || []) as Practitioner[];
    },
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Don't render if no practitioners or still loading
  if (isLoading || practitioners.length === 0) {
    return null;
  }

  return (
    <div className="mb-8 animate-fade-in" style={{ animationDelay: '0.05s' }}>
      <div className="flex items-center justify-between px-4 sm:px-6 mb-4">
        <h4 className="text-xs uppercase tracking-widest text-white/80 font-medium">
          {t('welcome.ourExperts')}
        </h4>
      </div>
      <div className="flex gap-2 sm:gap-3 overflow-x-auto px-4 sm:px-6 no-scrollbar pb-2">
        {practitioners.map((practitioner) => (
          <PractitionerCard
            key={practitioner.id}
            firstName={practitioner.first_name}
            profileImage={practitioner.profile_image}
            skills={practitioner.skills}
          />
        ))}
      </div>
    </div>
  );
}
