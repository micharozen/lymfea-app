import { useCallback, useMemo, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  accountSchema,
  organizationSchema,
  venueSchema,
  planSchema,
  type OnboardingValues,
  type StepKey,
} from "./schemas";

const onboardingSchema = z.intersection(
  z.intersection(accountSchema, organizationSchema),
  z.intersection(venueSchema, planSchema),
);

interface UseOnboardingFlowOptions {
  presetPlanCode?: "starter" | "pro";
  presetBillingCycle?: "monthly" | "yearly";
  startStep?: StepKey;
  initialEmail?: string;
  initialFirstName?: string;
  initialLastName?: string;
  initialPhone?: string;
}

interface UseOnboardingFlowReturn {
  form: UseFormReturn<OnboardingValues>;
  steps: StepKey[];
  currentStep: StepKey;
  currentIndex: number;
  isFirst: boolean;
  isLast: boolean;
  goNext: () => Promise<boolean>;
  goBack: () => void;
  goTo: (step: StepKey) => void;
}

const FIELDS_PER_STEP: Record<StepKey, (keyof OnboardingValues)[]> = {
  account: [
    "email",
    "password",
    "confirmPassword",
    "firstName",
    "lastName",
    "phone",
    "countryCode",
    "termsAccepted",
    "privacyAccepted",
  ],
  organization: ["organizationName"],
  venue: ["venueType", "venueName", "venueAddress"],
  plan: ["planCode", "billingCycle"],
  summary: [],
};

export function useOnboardingFlow(
  options: UseOnboardingFlowOptions = {},
): UseOnboardingFlowReturn {
  const {
    presetPlanCode,
    presetBillingCycle,
    startStep = "account",
    initialEmail = "",
    initialFirstName = "",
    initialLastName = "",
    initialPhone = "",
  } = options;

  const hasPreset = Boolean(presetPlanCode && presetBillingCycle);

  const steps = useMemo<StepKey[]>(() => {
    const base: StepKey[] = ["account", "organization", "venue"];
    if (!hasPreset) base.push("plan");
    base.push("summary");
    return base;
  }, [hasPreset]);

  const [currentStep, setCurrentStep] = useState<StepKey>(startStep);

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    mode: "onBlur",
    defaultValues: {
      email: initialEmail,
      password: "",
      confirmPassword: "",
      firstName: initialFirstName,
      lastName: initialLastName,
      phone: initialPhone,
      countryCode: "+33",
      termsAccepted: false as unknown as true,
      privacyAccepted: false as unknown as true,
      organizationName: "",
      venueType: "hotel",
      venueName: "",
      venueAddress: "",
      venuePostalCode: "",
      venueCity: "",
      venueCountry: "",
      planCode: presetPlanCode ?? "starter",
      billingCycle: presetBillingCycle ?? "monthly",
    },
  });

  const currentIndex = steps.indexOf(currentStep);

  const goNext = useCallback(async () => {
    const fields = FIELDS_PER_STEP[currentStep];
    const ok = fields.length === 0 ? true : await form.trigger(fields);
    if (!ok) return false;
    const next = steps[currentIndex + 1];
    if (next) setCurrentStep(next);
    return true;
  }, [currentStep, currentIndex, form, steps]);

  const goBack = useCallback(() => {
    const prev = steps[currentIndex - 1];
    if (prev) setCurrentStep(prev);
  }, [currentIndex, steps]);

  const goTo = useCallback((step: StepKey) => {
    setCurrentStep(step);
  }, []);

  return {
    form,
    steps,
    currentStep,
    currentIndex,
    isFirst: currentIndex === 0,
    isLast: currentIndex === steps.length - 1,
    goNext,
    goBack,
    goTo,
  };
}
