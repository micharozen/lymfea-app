import { useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import brand from "@/config/brand.json";
import { setupErrorCode, venueSetupApi, venueSetupKeys, type SetupState } from "@/lib/venueSetup/api";
import { STEP_IDS, type StepId } from "@shared/venueSetup/spec";
import type { StepProps } from "@/components/setup/types";
import { CompanyStep } from "@/components/setup/steps/CompanyStep";
import { VenueStep } from "@/components/setup/steps/VenueStep";
import { HoursStep } from "@/components/setup/steps/HoursStep";
import { RoomsStep } from "@/components/setup/steps/RoomsStep";
import { AmenitiesStep } from "@/components/setup/steps/AmenitiesStep";
import { BookingStep } from "@/components/setup/steps/BookingStep";
import { FinanceStep } from "@/components/setup/steps/FinanceStep";
import { PaymentStep } from "@/components/setup/steps/PaymentStep";
import { PmsStep } from "@/components/setup/steps/PmsStep";
import { TeamStep } from "@/components/setup/steps/TeamStep";
import { BrandingStep } from "@/components/setup/steps/BrandingStep";
import { SummaryStep } from "@/components/setup/steps/SummaryStep";

type PageStep = StepId | "summary";

const STEP_COMPONENTS: Record<StepId, (props: StepProps) => JSX.Element> = {
  company: CompanyStep,
  venue: VenueStep,
  hours: HoursStep,
  rooms: RoomsStep,
  amenities: AmenitiesStep,
  booking: BookingStep,
  finance: FinanceStep,
  payment: PaymentStep,
  pms: PmsStep,
  team: TeamStep,
  branding: BrandingStep,
};

const FORM_ID = "venue-setup-step";

/** The PMS step only concerns hotel spas. */
function visibleSteps(state: SetupState): StepId[] {
  const venueType = (state.data.hotel as { venue_type?: string } | undefined)?.venue_type;
  return STEP_IDS.filter((s) => s !== "pms" || venueType !== "spa");
}

function LanguageSwitch() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("fr") ? "fr" : "en";
  return (
    <SelectField
      className="w-[90px]"
      searchable={false}
      value={lang}
      onChange={(v) => void i18n.changeLanguage(v)}
      options={[
        { value: "fr", label: "FR" },
        { value: "en", label: "EN" },
      ]}
    />
  );
}

function CenteredMessage({ icon, title, text }: { icon: JSX.Element; title: string; text: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <div className="flex justify-center">{icon}</div>
        <h1 className="text-xl font-normal">{title}</h1>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

export default function VenueSetup() {
  const { token = "" } = useParams();
  const { t } = useTranslation("setup");
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const query = useQuery({
    queryKey: venueSetupKeys.state(token),
    queryFn: () => venueSetupApi.get(token),
    retry: false,
    staleTime: Infinity,
  });

  // The document does not scroll here (body is the scroll container), so
  // bring the header back into view instead of window.scrollTo.
  const topRef = useRef<HTMLElement>(null);
  const goTo = (step: PageStep) => {
    setParams({ step }, { replace: false });
    topRef.current?.scrollIntoView({ block: "start" });
  };

  const saveMutation = useMutation({
    mutationFn: ({ step, sections }: { step: StepId; sections: Record<string, unknown> }) =>
      venueSetupApi.saveStep(token, step, sections),
    onSuccess: (res, { step }) => {
      const current = queryClient.getQueryData<SetupState>(venueSetupKeys.state(token));
      if (current) {
        queryClient.setQueryData<SetupState>(venueSetupKeys.state(token), { ...current, data: res.data });
      }
      toast.success(t("saved"));
      const steps: PageStep[] = [...visibleSteps({ ...(current as SetupState), data: res.data }), "summary"];
      goTo(steps[steps.indexOf(step) + 1] ?? "summary");
    },
    onError: (error) => {
      toast.error(setupErrorCode(error) === "locked" ? t("errors.locked") : t("errors.saveFailed"));
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => venueSetupApi.submit(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: venueSetupKeys.state(token) }),
    onError: () => toast.error(t("errors.submitFailed")),
  });

  if (query.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    const code = setupErrorCode(query.error);
    const key = code === "expired" || code === "archived" ? "expired" : "invalid";
    return (
      <CenteredMessage
        icon={<Lock className="h-8 w-8 text-muted-foreground" />}
        title={t(`linkErrors.${key}.title`)}
        text={t(`linkErrors.${key}.text`)}
      />
    );
  }

  const state = query.data;

  if (state.status !== "draft") {
    return (
      <CenteredMessage
        icon={<CheckCircle2 className="h-8 w-8 text-green-600" />}
        title={t("submitted.title")}
        text={t("submitted.text", { name: state.label })}
      />
    );
  }

  const steps = visibleSteps(state);
  const done = new Set(state.data._completed_steps ?? []);
  const requested = params.get("step") as PageStep | null;
  const current: PageStep =
    requested && (requested === "summary" || steps.includes(requested as StepId))
      ? requested
      : steps.find((s) => !done.has(s)) ?? "summary";
  const allPages: PageStep[] = [...steps, "summary"];
  const index = allPages.indexOf(current);
  const StepComponent = current === "summary" ? null : STEP_COMPONENTS[current];

  return (
    <div className="min-h-screen bg-background">
      <header ref={topRef} className="border-b">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{brand.name}</p>
            <p className="text-sm truncate">{t("title", { name: state.label })}</p>
          </div>
          <LanguageSwitch />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 md:grid md:grid-cols-[220px_1fr] md:gap-8">
        <nav className="hidden md:block">
          <ol className="space-y-0.5 sticky top-6">
            {allPages.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => goTo(s)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left",
                    s === current ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "h-5 w-5 rounded-full border text-[11px] flex items-center justify-center flex-shrink-0",
                      s !== "summary" && done.has(s) && "bg-foreground text-background border-foreground",
                    )}
                  >
                    {s !== "summary" && done.has(s) ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {t(`steps.${s}`)}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <main className="min-w-0">
          <div className="md:hidden mb-4">
            <SelectField
              searchable={false}
              value={current}
              onChange={(v) => goTo(v as PageStep)}
              options={allPages.map((s, i) => ({ value: s, label: `${i + 1}. ${t(`steps.${s}`)}` }))}
            />
          </div>

          <div className="mb-5">
            <p className="text-xs text-muted-foreground">
              {t("stepOf", { n: index + 1, total: allPages.length })}
            </p>
            <h1 className="text-xl font-normal mt-0.5">{t(`steps.${current}`)}</h1>
            {current !== "summary" && <p className="text-sm text-muted-foreground mt-1">{t(`stepIntros.${current}`)}</p>}
          </div>

          {StepComponent && current !== "summary" ? (
            <StepComponent
              key={current}
              token={token}
              state={state}
              formId={FORM_ID}
              onSave={(sections) => saveMutation.mutate({ step: current, sections })}
            />
          ) : (
            <SummaryStep
              state={state}
              steps={steps}
              submitting={submitMutation.isPending}
              onGoTo={goTo}
              onSubmit={() => setConfirmOpen(true)}
            />
          )}

          <div className="mt-8 pt-4 border-t flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" disabled={index === 0} onClick={() => goTo(allPages[index - 1])}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("nav.previous")}
            </Button>
            {current !== "summary" && (
              <Button type="submit" form={FORM_ID} disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("nav.saveAndContinue")}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3">{t("nav.shareHint")}</p>
        </main>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-normal">{t("summary.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("summary.confirmText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("nav.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => submitMutation.mutate()}>{t("summary.submit")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
