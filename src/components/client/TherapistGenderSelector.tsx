import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { TherapistGender } from '@/pages/client/context/FlowContext';

interface TherapistGenderSelectorProps {
  value: TherapistGender;
  onChange: (gender: TherapistGender) => void;
}

const OPTIONS: { value: TherapistGender; labelKey: string }[] = [
  { value: null, labelKey: 'therapistGender.noPreference' },
  { value: 'female', labelKey: 'therapistGender.female' },
  { value: 'male', labelKey: 'therapistGender.male' },
];

export function TherapistGenderSelector({ value, onChange }: TherapistGenderSelectorProps) {
  const { t } = useTranslation('client');

  return (
    <div className="space-y-3">
      <h4 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
        {t('therapistGender.title')}
      </h4>
      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value ?? 'none'}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 py-2.5 px-3 rounded-lg border text-sm font-medium whitespace-nowrap transition-all duration-200",
              value === option.value
                ? "border-gold-500 bg-gold-500/10 text-gold-600"
                : "border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300"
            )}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
