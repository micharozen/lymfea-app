import { cn } from '@/lib/utils';

interface BookingProgressBarProps {
  currentStep: number;
}

const STEPS = [
  { id: 1, label: 'Infos' },
  { id: 2, label: 'Prestations' },
  { id: 3, label: 'Récap' },
];

export function BookingProgressBar({ currentStep }: BookingProgressBarProps) {
  if (currentStep > 3) return null;

  const percentage = (currentStep / STEPS.length) * 100;

  return (
    <div className="px-4 pt-3 pb-2 shrink-0">
      <div className="flex items-center justify-between mb-2">
        {STEPS.map((step) => (
          <span
            key={step.id}
            className={cn(
              'text-[10px] uppercase tracking-widest transition-colors duration-300',
              currentStep >= step.id
                ? 'text-gold-400 font-semibold'
                : 'text-muted-foreground font-medium'
            )}
          >
            {step.label}
          </span>
        ))}
      </div>
      <div className="w-full bg-border/50 h-1 rounded-full overflow-hidden">
        <div
          className="bg-gold-400 h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
