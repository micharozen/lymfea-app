import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import oomLogo from '@/assets/oom-monogram-white-client.svg';
import type { HotelInfo } from '../hooks/useEnterpriseDashboard';

interface DashboardHeroProps {
  hotel: HotelInfo;
}

export function DashboardHero({ hotel }: DashboardHeroProps) {
  const { t } = useTranslation('client');

  return (
    <div className="relative w-full overflow-hidden bg-gray-900 shrink-0">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        {hotel.cover_image ? (
          <img
            src={hotel.cover_image}
            className="h-full w-full object-cover scale-105 brightness-[0.4] animate-hero-zoom"
            alt="Ambiance"
          />
        ) : (
          <div className="h-full w-full bg-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
      </div>

      {/* Language Switcher */}
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher variant="pill" />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 w-full max-w-2xl mx-auto pt-12 sm:pt-16 pb-8 sm:pb-10 px-6">
        <div className="animate-fade-in">
          {/* Logos: OOM × Company */}
          <div className="flex items-center gap-3 sm:gap-4 mb-6">
            <a href="https://oomworld.com" target="_blank" rel="noopener noreferrer">
              <img
                src={oomLogo}
                alt="OOM"
                className="h-8 w-8 sm:h-10 sm:w-10"
              />
            </a>
            <span className="text-gold-400/60 text-lg sm:text-xl font-light select-none">×</span>
            {hotel.image ? (
              <img
                src={hotel.image}
                alt={hotel.name}
                className="h-10 w-auto sm:h-12 object-contain"
              />
            ) : (
              <span className="text-white font-serif text-lg sm:text-xl tracking-wide">{hotel.name}</span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-400 mb-3 font-semibold animate-slide-up-fade" style={{ animationDelay: '0.3s' }}>
            {t('enterpriseDashboard.label')}
          </h3>
          <h1
            className="font-serif text-2xl sm:text-3xl md:text-4xl leading-tight text-white animate-slide-up-fade"
            style={{ animationDelay: '0.5s' }}
          >
            <span className="italic text-gold-200">{hotel.name}</span>
            <br />
            {t('enterpriseDashboard.subtitle')}
          </h1>
        </div>
      </div>
    </div>
  );
}
