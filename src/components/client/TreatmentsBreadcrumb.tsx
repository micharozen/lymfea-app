import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BreadcrumbStep = 'treatments' | 'time' | 'validate';

interface TreatmentsBreadcrumbProps {
  currentStep: BreadcrumbStep;
  className?: string;
}

const STEPS: BreadcrumbStep[] = ['treatments', 'time', 'validate'];

export function TreatmentsBreadcrumb({ currentStep, className }: TreatmentsBreadcrumbProps) {
  const { t } = useTranslation('client');

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        'hidden lg:flex items-center gap-2 text-xs font-grotesk tracking-wide',
        className,
      )}
    >
      {STEPS.map((step, index) => {
        const isCurrent = step === currentStep;
        const isLast = index === STEPS.length - 1;
        return (
          <div key={step} className="flex items-center gap-2">
            <span
              className={cn(
                'transition-colors',
                isCurrent ? 'text-gold-600 font-medium' : 'text-gray-400',
              )}
            >
              {t(`breadcrumb.${step}`)}
            </span>
            {!isLast && <ChevronRight className="h-3 w-3 text-gray-300" />}
          </div>
        );
      })}
    </nav>
  );
}
