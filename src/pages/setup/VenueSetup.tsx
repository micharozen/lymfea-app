import { useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Badge } from "@/components/ui/badge";
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
import { setupErrorCode, venueSetupApi, venueSetupKeys, type SetupState } from "@/lib/venueSetup/api";
import { STEP_IDS, STEPS, type StepId } from "@shared/venueSetup/spec";
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
import { ContactButton, SetupHeader } from "@/components/setup/SetupHeader";
import { WelcomeScreen } from "@/components/setup/WelcomeScreen";
import { playSavedChime } from "@/lib/venueSetup/sound";

type PageStep = StepId | "summary" | "welcome";

/** Steps a venue can skip entirely: flagged "optional" in the navigation. */
const OPTIONAL_STEPS: ReadonlySet<StepId> = new Set(["amenities", "payment", "pms", "team", "branding"]);

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

function CenteredMessage({ icon, title, text, label }: { icon: JSX.Element; title: string; text: string; label?: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SetupHeader label={label ?? ""} />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex justify-center">{icon}</div>
          <h1 className="text-2xl font-normal">{title}</h1>
          <p className="text-sm text-muted-foreground">{text}</p>
          <div className="pt-2">
            <ContactButton label={label} />
          </div>
        </div>
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
    // The link is shared: a colleague may have saved steps in another tab.
    // Reload on focus so a form never opens on stale answers and overwrites them.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // The document does not scroll here (body is the scroll container), so
  // bring the header back into view instead of window.scrollTo.
  const topRef = useRef<HTMLDivElement>(null);
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
      playSavedChime();
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
        icon={<CheckCircle2 className="h-12 w-12 text-green-600 animate-in zoom-in-50 spin-in-12 duration-700" />}
        title={t("submitted.title")}
        text={t("submitted.text", { name: state.label })}
        label={state.label}
      />
    );
  }

  const steps = visibleSteps(state);
  const done = new Set(state.data._completed_steps ?? []);
  const requested = params.get("step") as PageStep | null;
  const current: PageStep =
    requested && (requested === "summary" || requested === "welcome" || steps.includes(requested as StepId))
      ? requested
      : done.size === 0
        ? "welcome"
        : steps.find((s) => !done.has(s)) ?? "summary";
  const progress = Math.round((steps.filter((s) => done.has(s)).length / steps.length) * 100);

  if (current === "welcome") {
    return (
      <div className="min-h-screen bg-background">
        <SetupHeader label={state.label} topRef={topRef} />
        <WelcomeScreen
          label={state.label}
          launchDate={state.launch_date}
          steps={steps}
          resuming={done.size > 0}
          token={token}
          prefill={state.data._prefill}
          websiteUrl={(state.data.hotel as { website_url?: string } | undefined)?.website_url}
          onStart={() => goTo(steps.find((s) => !done.has(s)) ?? "summary")}
          onPrefilled={async (count) => {
            await queryClient.invalidateQueries({ queryKey: venueSetupKeys.state(token) });
            playSavedChime();
            toast.success(t("prefill.success", { count }));
            goTo(steps.find((s) => !done.has(s)) ?? "summary");
          }}
        />
      </div>
    );
  }

  // Past the welcome screen (narrowing is lost without strict mode).
  const page = current as StepId | "summary";
  const allPages: (StepId | "summary")[] = [...steps, "summary"];
  const index = allPages.indexOf(page);
  const StepComponent = page === "summary" ? null : STEP_COMPONENTS[page];
  // AI-filled answers of this step's sections, to flag "please review".
  const aiFilledHere =
    page !== "summary" &&
    (state.data._prefill?.filled ?? []).some((key) =>
      (STEPS[page] as readonly string[]).includes(key.split(".")[0]),
    );

  return (
    <div className="min-h-screen bg-background">
      <SetupHeader label={state.label} progress={progress} topRef={topRef} />

      <div className="max-w-5xl mx-auto px-4 py-6 md:grid md:grid-cols-[240px_1fr] md:gap-8">
        <nav className="hidden md:block">
          <ol className="space-y-0.5 sticky top-[113px]">
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
                  <span className="flex-1">{t(`steps.${s}`)}</span>
                  {s !== "summary" && OPTIONAL_STEPS.has(s) && (
                    <span className="text-[10px] text-muted-foreground/80">{t("optional")}</span>
                  )}
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
            <h1 className="text-xl font-normal mt-0.5 flex items-center gap-2">
              {t(`steps.${current}`)}
              {page !== "summary" && OPTIONAL_STEPS.has(page) && (
                <Badge variant="outline" className="font-normal">{t("optional")}</Badge>
              )}
            </h1>
            {current !== "summary" && <p className="text-sm text-muted-foreground mt-1">{t(`stepIntros.${current}`)}</p>}
            {current !== "summary" && (
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-destructive">*</span> {t("requiredLegend")}
              </p>
            )}
            {aiFilledHere && (
              <p className="mt-3 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs flex items-center gap-2 animate-in fade-in duration-500">
                <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                {t("prefill.banner")}
              </p>
            )}
          </div>

          <div key={current} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {StepComponent && current !== "summary" ? (
            <StepComponent
              key={current}
              token={token}
              state={state}
              formId={FORM_ID}
              onSave={(sections) => saveMutation.mutate({ step: page as StepId, sections })}
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
          </div>

          <div className="mt-8 pt-4 border-t flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => goTo(index === 0 ? "welcome" : allPages[index - 1])}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("nav.previous")}
            </Button>
            {current !== "summary" && (
              <Button type="submit" form={FORM_ID} disabled={saveMutation.isPending} className="transition-transform active:scale-95">
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
