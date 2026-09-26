import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarDays, CheckCircle2, Clock, Save, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PrefillInfo, StepId } from "@shared/venueSetup/spec";
import { ContactButton } from "./SetupHeader";
import { WebsitePrefill } from "./WebsitePrefill";

interface WelcomeScreenProps {
  label: string;
  /** Planned launch date (YYYY-MM-DD), set by Eïa when creating the link. */
  launchDate?: string | null;
  steps: StepId[];
  resuming: boolean;
  token: string;
  prefill?: PrefillInfo;
  websiteUrl?: string;
  onStart: () => void;
  onPrefilled: (filledCount: number) => void;
}

const PREPARE_KEYS = ["siren", "visuals", "hours", "rooms", "team"] as const;

/** Staggered entrance: each block slides in slightly after the previous one. */
const reveal = (i: number, className = "") => ({
  className: `animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both ${className}`,
  style: { animationDelay: `${i * 90}ms` },
});

export function WelcomeScreen({
  label,
  launchDate,
  steps,
  resuming,
  token,
  prefill,
  websiteUrl,
  onStart,
  onPrefilled,
}: WelcomeScreenProps) {
  const { t, i18n } = useTranslation("setup");

  // A calendar day with no time zone: parse it as local midnight.
  const launchLabel = launchDate
    ? new Date(`${launchDate}T00:00:00`).toLocaleDateString(i18n.language?.startsWith("fr") ? "fr-FR" : "en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const highlights = [
    { icon: Clock, title: t("welcome.timeTitle"), text: t("welcome.timeText") },
    { icon: Save, title: t("welcome.saveTitle"), text: t("welcome.saveText") },
    { icon: Share2, title: t("welcome.shareTitle"), text: t("welcome.shareText") },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 md:py-16 space-y-10">
      <section {...reveal(0)}>
        <p className="text-sm text-muted-foreground">{t("welcome.kicker")}</p>
        <h1 className="text-3xl md:text-4xl font-normal tracking-tight mt-2">{t("welcome.title", { name: label })}</h1>
        <p className="text-base text-muted-foreground mt-4 max-w-2xl">{t("welcome.intro")}</p>
        {launchLabel && (
          <div className="mt-6 inline-flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <CalendarDays className="h-5 w-5 text-primary flex-shrink-0" />
            <div>
              <p className="text-sm">{t("welcome.launchTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("welcome.launchText", { date: launchLabel })}</p>
            </div>
          </div>
        )}
      </section>

      <section {...reveal(1, "grid gap-3 sm:grid-cols-3")}>
        {highlights.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border bg-card p-4">
            <Icon className="h-5 w-5 text-primary" />
            <p className="text-sm mt-3">{title}</p>
            <p className="text-xs text-muted-foreground mt-1">{text}</p>
          </div>
        ))}
      </section>

      <section {...reveal(2)}>
        <WebsitePrefill token={token} prefill={prefill} initialUrl={websiteUrl} onDone={onPrefilled} />
      </section>

      <section {...reveal(3, "grid gap-6 md:grid-cols-2")}>
        <div>
          <h2 className="text-sm font-medium">{t("welcome.prepareTitle")}</h2>
          <ul className="mt-3 space-y-2">
            {PREPARE_KEYS.map((k) => (
              <li key={k} className="flex gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <span>{t(`welcome.prepare.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-medium">{t("welcome.stepsTitle")}</h2>
          <ol className="mt-3 space-y-1.5">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-5 w-5 rounded-full border text-[11px] flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                {t(`steps.${s}`)}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section {...reveal(4, "rounded-xl bg-muted/50 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between")}>
        <div>
          <p className="text-sm">{t("welcome.helpTitle")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("welcome.helpText")}</p>
        </div>
        <ContactButton label={label} />
      </section>

      <div {...reveal(5, "flex justify-end")}>
        <Button size="lg" onClick={onStart}>
          {resuming ? t("welcome.resume") : t("welcome.start")}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
