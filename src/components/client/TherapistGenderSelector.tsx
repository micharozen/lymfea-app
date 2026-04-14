import { useTranslation } from 'react-i18next';
import { Venus, Mars, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TherapistGender } from '@/pages/client/context/FlowContext';

interface TherapistGenderSelectorProps {
  value: TherapistGender;
  onChange: (gender: TherapistGender) => void;
}

const OPTIONS: { value: TherapistGender; labelKey: string; Icon: typeof UserRound }[] = [
  { value: null, labelKey: 'therapistGender.noPreference', Icon: UserRound },
  { value: 'female', labelKey: 'therapistGender.female', Icon: Venus },
  { value: 'male', labelKey: 'therapistGender.male', Icon: Mars },
];

export function TherapistGenderSelector({ value, onChange }: TherapistGenderSelectorProps) {
  const { t } = useTranslation('client');

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="text-xs uppercase tracking-widest text-gray-500 font-medium shrink-0">
        {t('therapistGender.title')}
      </span>
      <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 p-0.5">
        {OPTIONS.map((option) => {
          const Icon = option.Icon;
          const isActive = value === option.value;
          return (
            <button
              key={option.value ?? 'none'}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'h-8 inline-flex items-center gap-1.5 px-3 rounded-full text-xs font-medium transition-all duration-150',
                isActive
                  ? 'bg-white text-gold-600 shadow-sm ring-1 ring-gold-300'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
              {t(option.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
