import { cn } from '@/lib/utils';

interface StepTransitionProps {
  step: number;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
  className?: string;
}

export function StepTransition({ step, direction, children, className }: StepTransitionProps) {
  return (
    <div
      key={step}
      className={cn(
        'flex-1 flex flex-col overflow-hidden',
        direction === 'forward'
          ? 'animate-in slide-in-from-right-10 fade-in duration-300'
          : 'animate-in slide-in-from-left-10 fade-in duration-300',
        className
      )}
    >
      {children}
    </div>
  );
}
