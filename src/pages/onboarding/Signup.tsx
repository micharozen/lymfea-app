import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import type { StepKey } from "@/components/onboarding/schemas";
import type { PlanCode, BillingCycle } from "@/lib/billing";

interface InitialState {
  startStep: StepKey;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

function parsePlanQuery(value: string | null): PlanCode | undefined {
  if (value === "starter" || value === "pro") return value;
  return undefined;
}

function parseCycleQuery(value: string | null): BillingCycle | undefined {
  if (value === "monthly" || value === "yearly") return value;
  return undefined;
}

export default function Signup() {
  const navigate = useNavigate();
  const { t } = useTranslation("admin");
  const [params] = useSearchParams();

  const presetPlanCode = parsePlanQuery(params.get("plan"));
  const presetBillingCycle = parseCycleQuery(params.get("cycle"));
  const canceled = params.get("canceled") === "1";

  const [initial, setInitial] = useState<InitialState | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (canceled) {
      toast.info(t("onboarding.errors.checkoutCancelled"));
    }
  }, [canceled, t]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        if (!cancelled) setInitial({ startStep: "account" });
        return;
      }

      // Authenticated — check if onboarding already done.
      const { data: adminRow } = await supabase
        .from("admins")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminRow?.organization_id) {
        // Already onboarded — send them to the billing dashboard.
        if (!cancelled) {
          setRedirecting(true);
          navigate("/admin/billing", { replace: true });
        }
        return;
      }

      // Authenticated but no admins row → land on organization step
      // with profile fields pre-filled from auth.users.user_metadata.
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = typeof meta.full_name === "string" ? meta.full_name : (meta.name as string | undefined);
      const [splitFirst, ...splitRest] = (fullName ?? "").trim().split(/\s+/);
      const splitLast = splitRest.join(" ");
      if (!cancelled) {
        setInitial({
          startStep: "organization",
          email: user.email ?? undefined,
          firstName:
            (meta.first_name as string) ??
            (meta.given_name as string) ??
            splitFirst ??
            "",
          lastName:
            (meta.last_name as string) ??
            (meta.family_name as string) ??
            splitLast ??
            "",
          phone: (meta.phone as string) ?? "",
        });
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (redirecting || !initial) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <OnboardingDialog
        open
        presetPlanCode={presetPlanCode}
        presetBillingCycle={presetBillingCycle}
        startStep={initial.startStep}
        initialEmail={initial.email}
        initialFirstName={initial.firstName}
        initialLastName={initial.lastName}
        initialPhone={initial.phone}
      />
    </div>
  );
}
