import { cn } from '@/lib/utils';

export type BookingStep = 'schedule' | 'guest-info' | 'payment';

const STEPS: BookingStep[] = ['schedule', 'guest-info', 'payment'];

interface ProgressBarProps {
  currentStep: BookingStep;
  className?: string;
}

export function getProgressPercentage(step: BookingStep): number {
  const stepIndex = STEPS.indexOf(step);
  if (stepIndex === -1) return 0;
  return ((stepIndex + 1) / STEPS.length) * 100;
}

export function ProgressBar({ currentStep, className }: ProgressBarProps) {
  const percentage = getProgressPercentage(currentStep);

  return (
    <div className={cn("w-full bg-gray-200 h-0.5", className)}>
      <div
        className="bg-gold-400 h-full transition-all duration-500"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
