import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  APP_BRANCH,
  APP_BUILD_TIME,
  APP_COMMIT_SHA,
  APP_ENV,
  APP_VERSION,
} from "@/lib/appVersion";

interface DebugPanelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  therapistId?: string | null;
  userId?: string | null;
}

function readServiceWorkers(): Promise<string[]> {
  if (!("serviceWorker" in navigator)) return Promise.resolve(["unsupported"]);
  return navigator.serviceWorker
    .getRegistrations()
    .then((regs) =>
      regs.length === 0
        ? ["none"]
        : regs.map((r) => {
            const state = r.active ? "active" : r.waiting ? "waiting" : r.installing ? "installing" : "?";
            const script = r.active?.scriptURL ?? r.waiting?.scriptURL ?? r.installing?.scriptURL ?? "?";
            return `${state} · ${script.replace(window.location.origin, "")}`;
          }),
    )
    .catch(() => ["error"]);
}

function readSession(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "—";
  } catch {
    return "—";
  }
}

const DebugPanelDialog = ({ open, onOpenChange, therapistId, userId }: DebugPanelDialogProps) => {
  const { t } = useTranslation("pwa");
  const [workers, setWorkers] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void readServiceWorkers().then((list) => {
      if (!cancelled) setWorkers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const isInstalled =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;

  const rows: [string, string][] = [
    ["version", APP_VERSION],
    ["commit", APP_COMMIT_SHA],
    ["branch", APP_BRANCH],
    ["build", APP_BUILD_TIME],
    ["env", APP_ENV],
    ["therapist_id", therapistId ?? "—"],
    ["user_id", userId ?? "—"],
    ["installed", isInstalled ? "yes" : "no"],
    ["lang", navigator.language],
    ["viewport", `${window.innerWidth}×${window.innerHeight}`],
    ["safe-bottom", getComputedStyle(document.documentElement).getPropertyValue("--app-safe-bottom").trim() || "—"],
    // Compteurs posés par le filet de rattrapage de chunk de src/main.tsx :
    // c'est ce qu'on veut voir en premier après un écran blanc post-déploiement.
    ["chunk-reloads", readSession("__chunk_reload_attempts")],
    ["chunk-last", readSession("__chunk_reloaded_at")],
    ["service-workers", workers.join(" | ") || "…"],
  ];

  const handleCopy = () => {
    const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDisable = () => {
    try {
      localStorage.removeItem("app-debug");
    } catch {
      // Ignore storage errors
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("profile.debugTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 py-2 font-mono text-[11px]">
          {rows.map(([key, value]) => (
            <div key={key} className="flex gap-2 border-b border-border/50 py-1 last:border-0">
              <span className="w-28 shrink-0 text-muted-foreground">{key}</span>
              <span className="min-w-0 break-all">{value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {t("profile.debugCopy")}
          </Button>
          <Button variant="ghost" size="sm" className="flex-1" onClick={handleDisable}>
            {t("profile.debugDisable")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DebugPanelDialog;
