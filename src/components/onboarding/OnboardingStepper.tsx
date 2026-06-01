import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { StepKey } from "./schemas";

interface OnboardingStepperProps {
  steps: StepKey[];
  currentStep: StepKey;
}

export function OnboardingStepper({ steps, currentStep }: OnboardingStepperProps) {
  const { t } = useTranslation("admin");
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const label = t(`onboarding.steps.${step}`);

        return (
          <div key={step} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors",
                  isCompleted && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary bg-background text-primary",
                  !isCompleted &&
                    !isCurrent &&
                    "border-muted-foreground/30 bg-background text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden md:block",
                  isCurrent && "text-foreground",
                  !isCurrent && "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>

            {index < steps.length - 1 && (
              <div
                className={cn(
                  "mx-3 h-0.5 w-8 transition-colors",
                  isCompleted ? "bg-primary" : "bg-muted-foreground/30",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
