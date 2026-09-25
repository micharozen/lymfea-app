import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Globe, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setupErrorCode, venueSetupApi } from "@/lib/venueSetup/api";
import { MAX_PREFILLS, type PrefillInfo } from "@shared/venueSetup/spec";

interface WebsitePrefillProps {
  token: string;
  prefill?: PrefillInfo;
  initialUrl?: string;
  /** Called with the number of fields filled once answers are saved. */
  onDone: (filledCount: number) => void;
}

// Cosmetic pipeline shown while the server works (one request end to end).
const PIPELINE = ["search", "pages", "legal", "registry", "fill"] as const;
const STEP_MS = 5000;
const DONE_PAUSE_MS = 700;

export function WebsitePrefill({ token, prefill, initialUrl, onDone }: WebsitePrefillProps) {
  const { t } = useTranslation("setup");
  const [url, setUrl] = useState(initialUrl ?? prefill?.url ?? "");
  const [running, setRunning] = useState(false);
  // Index of the step in progress; PIPELINE.length once everything is done.
  const [phase, setPhase] = useState(0);
  const remaining = MAX_PREFILLS - (prefill?.count ?? 0);

  const run = async () => {
    if (!url.trim() || running) return;
    setRunning(true);
    setPhase(0);
    // The last step keeps spinning until the server answers.
    const timer = window.setInterval(() => setPhase((p) => Math.min(p + 1, PIPELINE.length - 1)), STEP_MS);
    try {
      const res = await venueSetupApi.prefillFromWebsite(token, url.trim());
      window.clearInterval(timer);
      setPhase(PIPELINE.length);
      await new Promise((r) => window.setTimeout(r, DONE_PAUSE_MS));
      onDone(res.filled.length);
    } catch (error) {
      const code = setupErrorCode(error);
      toast.error(
        code === "prefill_limit"
          ? t("prefill.errors.limit")
          : code === "invalid_url"
            ? t("prefill.errors.url")
            : t("prefill.errors.failed"),
      );
    } finally {
      window.clearInterval(timer);
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex gap-3">
        <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm">{t("prefill.title")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("prefill.text")}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="url"
            inputMode="url"
            placeholder="https://www.mon-spa.fr"
            className="pl-9"
            value={url}
            disabled={running}
            aria-label={t("prefill.urlLabel")}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void run()}
          />
        </div>
        <Button type="button" onClick={run} disabled={!url.trim() || running || remaining <= 0}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {t("prefill.button")}
        </Button>
      </div>

      {running && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-out"
              style={{ width: `${Math.round(((phase + (phase < PIPELINE.length ? 0.5 : 0)) / PIPELINE.length) * 100)}%` }}
            />
          </div>
          <ol className="space-y-2">
            {PIPELINE.map((key, i) => {
              const state = i < phase ? "done" : i === phase ? "active" : "pending";
              return (
                <li
                  key={key}
                  className={cn(
                    "flex items-center gap-2.5 text-sm transition-colors duration-300",
                    state === "pending" && "text-muted-foreground/50",
                    state === "active" && "text-foreground",
                    state === "done" && "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 border transition-all duration-300",
                      state === "done" && "bg-primary border-primary text-primary-foreground",
                      state === "active" && "border-primary",
                    )}
                  >
                    {state === "done" && <Check className="h-3 w-3 animate-in zoom-in-50 duration-300" />}
                    {state === "active" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    {state === "pending" && <span className="text-[10px]">{i + 1}</span>}
                  </span>
                  <span className={cn(state === "active" && "animate-pulse")}>{t(`prefill.pipeline.${key}`)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {!running && prefill && (
        <p className="text-xs text-muted-foreground">
          {t("prefill.done", { count: prefill.filled.length, url: prefill.url })}
          {remaining > 0 && ` ${t("prefill.remaining", { count: remaining })}`}
        </p>
      )}
    </div>
  );
}
