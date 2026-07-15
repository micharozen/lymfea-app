import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookingProgressBarProps {
  /** 1-based current step (1=Infos, 2=Prestations, 3=Récap, 4=Confirmé) */
  currentStep: number;
}

const STEPS = ['Infos', 'Prestations', 'Récap'];

/** Stepper « Saoma » — pastilles Infos → Prestations → Récap. Masqué sur l'écran confirmé. */
export function BookingProgressBar({ currentStep }: BookingProgressBarProps) {
  if (currentStep > 3) return null;

  // step index 0-based pour comparer aux étapes
  const idx = currentStep - 1;

  return (
    <div className="stepper">
      {STEPS.map((label, i) => (
        <div
          key={label}
          className={cn('step', i === idx && 'cur', i < idx && 'done')}
        >
          <span className="pill">
            {i < idx ? <Check size={11} /> : i + 1}
          </span>
          <span className="nm">{label}</span>
          {i < STEPS.length - 1 && <span className="bar" />}
        </div>
      ))}
    </div>
  );
}
