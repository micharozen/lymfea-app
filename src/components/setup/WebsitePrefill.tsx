import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Loader2, Sparkles } from "lucide-react";
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

const LOADING_KEYS = ["reading", "legal", "extracting"] as const;

export function WebsitePrefill({ token, prefill, initialUrl, onDone }: WebsitePrefillProps) {
  const { t } = useTranslation("setup");
  const [url, setUrl] = useState(initialUrl ?? prefill?.url ?? "");
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const remaining = MAX_PREFILLS - (prefill?.count ?? 0);

  const run = async () => {
    if (!url.trim() || running) return;
    setRunning(true);
    setPhase(0);
    // Purely cosmetic progress messages while the server reads the site.
    const timer = window.setInterval(() => setPhase((p) => Math.min(p + 1, LOADING_KEYS.length - 1)), 4000);
    try {
      const res = await venueSetupApi.prefillFromWebsite(token, url.trim());
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
        <p key={phase} className="text-xs text-muted-foreground animate-in fade-in duration-500">
          {t(`prefill.loading.${LOADING_KEYS[phase]}`)}
        </p>
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
