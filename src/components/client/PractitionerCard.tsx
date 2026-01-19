import { useTranslation } from 'react-i18next';
import oomLogo from '@/assets/oom-monogram-white-client.svg';

interface PractitionerCardProps {
  firstName: string;
  profileImage: string | null;
  skills: string[] | null;
}

export function PractitionerCard({ firstName, profileImage, skills }: PractitionerCardProps) {
  const { t } = useTranslation('client');

  const displaySkill = skills && skills.length > 0
    ? skills[0]
    : t('welcome.expertHairdresser');

  return (
    <div className="flex-shrink-0 w-28 group cursor-default">
      <div className="aspect-[3/4] rounded-sm overflow-hidden mb-2 bg-gradient-to-b from-zinc-800 to-zinc-900 ring-1 ring-white/10 relative">
        {profileImage ? (
          <img
            src={profileImage}
            alt={firstName}
            className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-6">
            <img src={oomLogo} className="w-full opacity-20" alt="" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-2 right-2">
          <h5 className="text-xs font-serif text-white truncate">{firstName}</h5>
          <p className="text-[9px] text-gold-400/90 font-light truncate">{displaySkill}</p>
        </div>
      </div>
    </div>
  );
}
