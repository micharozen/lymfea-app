import { useTranslation } from "react-i18next";
import { type UseFormReturn } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { PlanCode } from "@/lib/billing";
import type { OnboardingValues } from "../schemas";

interface PublicPlan {
  code: PlanCode;
  name: string;
  monthly_amount_cents: number | null;
  yearly_amount_cents: number | null;
  currency: string;
}

function formatPrice(cents: number | null | undefined, currency: string): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100)} ${currency.toUpperCase()}`;
  }
}

interface PlanStepProps {
  form: UseFormReturn<OnboardingValues>;
}

export function PlanStep({ form }: PlanStepProps) {
  const { t } = useTranslation("admin");
  const { watch, setValue } = form;
  const planCode = watch("planCode");
  const billingCycle = watch("billingCycle");

  const plansQuery = useQuery<PublicPlan[]>({
    queryKey: ["public-plans", "onboarding"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("code, name, monthly_amount_cents, yearly_amount_cents, currency")
        .eq("is_active", true)
        .in("code", ["starter", "pro"])
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as PublicPlan[]) ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-full border border-border/60 bg-card p-1">
          <button
            type="button"
            onClick={() => setValue("billingCycle", "monthly", { shouldValidate: true })}
            className={cn(
              "rounded-full px-4 py-1 text-xs transition",
              billingCycle === "monthly"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("onboarding.plan.cycle.monthly")}
          </button>
          <button
            type="button"
            onClick={() => setValue("billingCycle", "yearly", { shouldValidate: true })}
            className={cn(
              "rounded-full px-4 py-1 text-xs transition",
              billingCycle === "yearly"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("onboarding.plan.cycle.yearly")}
            <span className="ml-1 text-[10px] text-primary">
              {t("onboarding.plan.cycle.yearlyHint")}
            </span>
          </button>
        </div>
      </div>

      {plansQuery.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(plansQuery.data ?? []).map((plan) => {
            const amount =
              billingCycle === "yearly"
                ? plan.yearly_amount_cents
                : plan.monthly_amount_cents;
            const isSelected = planCode === plan.code;
            return (
              <button
                key={plan.code}
                type="button"
                onClick={() =>
                  setValue("planCode", plan.code as "starter" | "pro", {
                    shouldValidate: true,
                  })
                }
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50",
                )}
              >
                {isSelected && (
                  <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <div className="text-xs font-medium uppercase tracking-wider text-primary">
                  {plan.name}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-serif text-2xl">
                    {formatPrice(amount, plan.currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    /{billingCycle === "yearly" ? t("onboarding.plan.unitYear") : t("onboarding.plan.unitMonth")}
                  </span>
                </div>
                <Label className="text-xs text-muted-foreground">
                  {t(`onboarding.plan.${plan.code}.tagline` as const, "")}
                </Label>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {t("onboarding.plan.trialNotice")}
      </p>
    </div>
  );
}
