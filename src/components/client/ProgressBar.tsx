import { cn } from '@/lib/utils';

export type BookingStep = 'schedule' | 'guest-info' | 'payment';

const STEPS: BookingStep[] = ['schedule', 'guest-info', 'payment'];
const BUNDLE_STEPS: BookingStep[] = ['guest-info', 'payment'];

interface ProgressBarProps {
  currentStep: BookingStep;
  className?: string;
  isBundleOnly?: boolean;
}

export function getProgressPercentage(step: BookingStep, isBundleOnly = false): number {
  const steps = isBundleOnly ? BUNDLE_STEPS : STEPS;
  const stepIndex = steps.indexOf(step);
  if (stepIndex === -1) return 0;
  return ((stepIndex + 1) / steps.length) * 100;
}

export function ProgressBar({ currentStep, className, isBundleOnly }: ProgressBarProps) {
  const percentage = getProgressPercentage(currentStep, isBundleOnly);

  return (
    <div className={cn("w-full bg-gray-200 h-0.5", className)}>
      <div
        className="bg-gold-500 h-full transition-all duration-500"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
