interface BookingProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

export default function BookingProgressBar({ currentStep, totalSteps }: BookingProgressBarProps) {
  return (
    <div className="w-full bg-muted h-1.5">
      <div 
        className="bg-primary h-full transition-all duration-300 ease-in-out"
        style={{ width: `${(currentStep / totalSteps) * 100}%` }}
      />
    </div>
  );
}
