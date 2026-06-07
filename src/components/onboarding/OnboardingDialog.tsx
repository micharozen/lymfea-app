import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  completeOrganizationSignup,
  createCheckoutSession,
} from "@/lib/billing";
import { OnboardingStepper } from "./OnboardingStepper";
import { EmailConfirmationGate } from "./EmailConfirmationGate";
import { AccountStep } from "./steps/AccountStep";
import { OrganizationStep } from "./steps/OrganizationStep";
import { VenueStep } from "./steps/VenueStep";
import { PlanStep } from "./steps/PlanStep";
import { SummaryStep } from "./steps/SummaryStep";
import { useOnboardingFlow } from "./useOnboardingFlow";
import type { StepKey } from "./schemas";

function formatFullPhone(countryCode: string, phone: string): string {
  const cleaned = (phone ?? "").replace(/\s/g, "");
  if (!cleaned) return "";
  // Already in E.164 form (e.g. resumed signup with stored phone) — pass through.
  if (cleaned.startsWith("+")) return cleaned;
  return `${countryCode}${cleaned.replace(/^0/, "")}`;
}

interface OnboardingDialogProps {
  open: boolean;
  presetPlanCode?: "starter" | "pro";
  presetBillingCycle?: "monthly" | "yearly";
  startStep?: StepKey;
  initialEmail?: string;
  initialFirstName?: string;
  initialLastName?: string;
  initialPhone?: string;
}

export function OnboardingDialog({
  open,
  presetPlanCode,
  presetBillingCycle,
  startStep = "account",
  initialEmail,
  initialFirstName,
  initialLastName,
  initialPhone,
}: OnboardingDialogProps) {
  const { t } = useTranslation("admin");

  const {
    form,
    steps,
    currentStep,
    isFirst,
    isLast,
    goNext,
    goBack,
    goTo,
  } = useOnboardingFlow({
    presetPlanCode,
    presetBillingCycle,
    startStep,
    initialEmail,
    initialFirstName,
    initialLastName,
    initialPhone,
  });

  const [signingUp, setSigningUp] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleSignup() {
    setGoogleLoading(true);
    try {
      const cycleQs = presetBillingCycle ? `&cycle=${presetBillingCycle}` : "";
      const planQs = presetPlanCode ? `?plan=${presetPlanCode}${cycleQs}` : "";
      localStorage.setItem(
        "oauth_intent",
        JSON.stringify({ next: `/signup${planQs}` }),
      );
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) {
        toast.error(error.message || t("onboarding.errors.oauthFailed"));
        localStorage.removeItem("oauth_intent");
        setGoogleLoading(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("onboarding.errors.oauthFailed");
      toast.error(msg);
      localStorage.removeItem("oauth_intent");
      setGoogleLoading(false);
    }
  }

  async function handleAccountSubmit() {
    const ok = await form.trigger([
      "email",
      "password",
      "confirmPassword",
      "firstName",
      "lastName",
      "phone",
      "countryCode",
      "termsAccepted",
      "privacyAccepted",
    ]);
    if (!ok) return;

    const values = form.getValues();
    const fullPhone = formatFullPhone(values.countryCode, values.phone);
    setSigningUp(true);
    try {
      const cycleQs = presetBillingCycle ? `&cycle=${presetBillingCycle}` : "";
      const planQs = presetPlanCode ? `?plan=${presetPlanCode}${cycleQs}` : "";
      const emailRedirectTo = `${window.location.origin}/signup${planQs}${
        planQs ? "&" : "?"
      }confirmed=1`;

      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            first_name: values.firstName,
            last_name: values.lastName,
            phone: fullPhone,
          },
          emailRedirectTo,
        },
      });

      if (error) {
        toast.error(error.message || t("onboarding.errors.signupFailed"));
        return;
      }

      if (!data.session) {
        // Email confirmation required
        setPendingEmail(values.email);
        return;
      }

      goTo("organization");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("onboarding.errors.signupFailed");
      toast.error(msg);
    } finally {
      setSigningUp(false);
    }
  }

  async function handleFinalize() {
    const values = form.getValues();
    setFinalizing(true);
    try {
      const { data: orgData, error: orgError } = await completeOrganizationSignup({
        organization_name: values.organizationName,
        first_name: values.firstName,
        last_name: values.lastName,
        phone: formatFullPhone(values.countryCode, values.phone),
      });
      if (orgError || !orgData) {
        toast.error(orgError?.message || t("onboarding.errors.orgFailed"));
        return;
      }

      const origin = window.location.origin;
      const { data: checkout, error: checkoutError } = await createCheckoutSession({
        plan_code: values.planCode,
        billing_cycle: values.billingCycle,
        seats: 1,
        success_url: `${origin}/onboarding/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/signup?canceled=1`,
        pending_venue: {
          name: values.venueName,
          address: values.venueAddress,
          venue_type: values.venueType,
          postal_code: values.venuePostalCode || undefined,
          city: values.venueCity || undefined,
          country: values.venueCountry || undefined,
        },
      });

      if (checkoutError || !checkout?.url) {
        toast.error(checkoutError?.message || t("onboarding.errors.checkoutFailed"));
        return;
      }

      window.location.href = checkout.url;
    } finally {
      setFinalizing(false);
    }
  }

  function renderStep() {
    switch (currentStep) {
      case "account":
        return (
          <AccountStep
            form={form}
            onGoogleSignup={handleGoogleSignup}
            googleLoading={googleLoading}
          />
        );
      case "organization":
        return <OrganizationStep form={form} />;
      case "venue":
        return <VenueStep form={form} />;
      case "plan":
        return <PlanStep form={form} />;
      case "summary":
        return <SummaryStep form={form} />;
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-[680px] max-h-[92vh] flex flex-col overflow-hidden p-0 [&>button.absolute]:hidden"
        hideOverlay
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex-shrink-0 border-b px-6 pt-6 pb-3">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-center">
              {pendingEmail
                ? t("onboarding.emailConfirm.title")
                : t("onboarding.title")}
            </DialogTitle>
            {!pendingEmail && (
              <OnboardingStepper steps={steps} currentStep={currentStep} />
            )}
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {pendingEmail ? (
            <EmailConfirmationGate email={pendingEmail} />
          ) : (
            <Form {...form}>
              <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
                {renderStep()}
              </form>
            </Form>
          )}
        </div>

        {!pendingEmail && (
          <div className="flex-shrink-0 border-t px-6 py-3 flex justify-between gap-3">
            {isFirst ? (
              <span />
            ) : (
              <Button type="button" variant="outline" onClick={goBack} disabled={finalizing}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("onboarding.cta.back")}
              </Button>
            )}

            {currentStep === "account" ? (
              <Button
                type="button"
                onClick={handleAccountSubmit}
                disabled={signingUp}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {signingUp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("onboarding.cta.next")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : isLast ? (
              <Button
                type="button"
                onClick={handleFinalize}
                disabled={finalizing}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {finalizing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                {t("onboarding.summary.goToCheckout")}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={goNext}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {t("onboarding.cta.next")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
