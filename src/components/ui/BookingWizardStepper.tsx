import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookingWizardStepperProps {
  currentStep: 1 | 2 | 3 | 4;
}

const STEPS = [
  { id: 1, label: "Informations" },
  { id: 2, label: "Prestations" },
  { id: 3, label: "Affectation" },
  { id: 4, label: "Paiement" },
] as const;

export function BookingWizardStepper({ currentStep }: BookingWizardStepperProps) {
  const visibleSteps = STEPS.filter((s) => s.id <= 3 || currentStep === 4);

  return (
    <div className="flex items-center justify-center gap-1 py-3 overflow-x-auto">
      {visibleSteps.map((step, index) => {
        const isCompleted = currentStep > step.id;
        const isCurrent = currentStep === step.id;

        return (
          <div key={step.id} className="flex items-center shrink-0">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors",
                  isCompleted && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary bg-background text-primary",
                  !isCompleted && !isCurrent && "border-muted-foreground/30 bg-background text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  step.id
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden lg:block",
                  isCurrent && "text-foreground",
                  !isCurrent && "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>

            {index < visibleSteps.length - 1 && (
              <div
                className={cn(
                  "mx-2 h-0.5 w-6 transition-colors",
                  isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
