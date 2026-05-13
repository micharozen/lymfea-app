import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { brand, brandLogos } from "@/config/brand";
import { cn } from "@/lib/utils";

type CheckStatus = "operational" | "degraded" | "down" | "checking";

interface ServiceCheck {
  id: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  status: CheckStatus;
  responseTimeMs?: number;
  error?: string;
}

const INITIAL_CHECKS: ServiceCheck[] = [
  {
    id: "web",
    labelFr: "Application web",
    labelEn: "Web application",
    descriptionFr: "Interface admin, PWA thérapeute et parcours client",
    descriptionEn: "Admin interface, therapist PWA and client flow",
    status: "checking",
  },
  {
    id: "api",
    labelFr: "API & Base de données",
    labelEn: "API & Database",
    descriptionFr: "Supabase Postgres et lecture des données publiques",
    descriptionEn: "Supabase Postgres and public data reads",
    status: "checking",
  },
  {
    id: "auth",
    labelFr: "Authentification",
    labelEn: "Authentication",
    descriptionFr: "Service de connexion utilisateurs",
    descriptionEn: "User sign-in service",
    status: "checking",
  },
  {
    id: "functions",
    labelFr: "Fonctions Edge",
    labelEn: "Edge functions",
    descriptionFr: "Notifications, paiements et intégrations PMS",
    descriptionEn: "Notifications, payments and PMS integrations",
    status: "checking",
  },
];

const statusMeta: Record<CheckStatus, { color: string; ring: string; bg: string }> = {
  operational: { color: "text-emerald-700", ring: "ring-emerald-200", bg: "bg-emerald-50" },
  degraded: { color: "text-amber-700", ring: "ring-amber-200", bg: "bg-amber-50" },
  down: { color: "text-red-700", ring: "ring-red-200", bg: "bg-red-50" },
  checking: { color: "text-muted-foreground", ring: "ring-border", bg: "bg-muted/40" },
};

const StatusIcon = ({ status }: { status: CheckStatus }) => {
  if (status === "checking") return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (status === "operational") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (status === "degraded") return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  return <XCircle className="h-5 w-5 text-red-600" />;
};

const Status = () => {
  const { t, i18n } = useTranslation();
  const isFr = i18n.language.startsWith("fr");
  const [checks, setChecks] = useState<ServiceCheck[]>(INITIAL_CHECKS);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    document.title = isFr
      ? `${brand.name} — Statut des services`
      : `${brand.name} — Service status`;
  }, [isFr]);

  const updateCheck = (id: string, patch: Partial<ServiceCheck>) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const runChecks = async () => {
    setIsRunning(true);
    setChecks((prev) => prev.map((c) => ({ ...c, status: "checking", responseTimeMs: undefined, error: undefined })));

    updateCheck("web", { status: "operational", responseTimeMs: 0 });

    const apiStart = performance.now();
    try {
      const { error } = await supabase.from("hotels").select("id", { count: "exact", head: true }).limit(1);
      const elapsed = Math.round(performance.now() - apiStart);
      if (error) {
        updateCheck("api", { status: "degraded", responseTimeMs: elapsed, error: error.message });
      } else {
        updateCheck("api", { status: "operational", responseTimeMs: elapsed });
      }
    } catch (err) {
      updateCheck("api", {
        status: "down",
        responseTimeMs: Math.round(performance.now() - apiStart),
        error: err instanceof Error ? err.message : "Network error",
      });
    }

    const authStart = performance.now();
    try {
      const { error } = await supabase.auth.getSession();
      const elapsed = Math.round(performance.now() - authStart);
      if (error) {
        updateCheck("auth", { status: "degraded", responseTimeMs: elapsed, error: error.message });
      } else {
        updateCheck("auth", { status: "operational", responseTimeMs: elapsed });
      }
    } catch (err) {
      updateCheck("auth", {
        status: "down",
        responseTimeMs: Math.round(performance.now() - authStart),
        error: err instanceof Error ? err.message : "Network error",
      });
    }

    const fnStart = performance.now();
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/`, {
        method: "OPTIONS",
        cache: "no-store",
      });
      const elapsed = Math.round(performance.now() - fnStart);
      if (res.ok || res.status === 401 || res.status === 404 || res.status === 405) {
        updateCheck("functions", { status: "operational", responseTimeMs: elapsed });
      } else {
        updateCheck("functions", { status: "degraded", responseTimeMs: elapsed, error: `HTTP ${res.status}` });
      }
    } catch (err) {
      updateCheck("functions", {
        status: "down",
        responseTimeMs: Math.round(performance.now() - fnStart),
        error: err instanceof Error ? err.message : "Network error",
      });
    }

    setLastUpdated(new Date());
    setIsRunning(false);
  };

  useEffect(() => {
    runChecks();
    const interval = window.setInterval(runChecks, 60_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overall: CheckStatus = useMemo(() => {
    if (checks.some((c) => c.status === "checking")) return "checking";
    if (checks.some((c) => c.status === "down")) return "down";
    if (checks.some((c) => c.status === "degraded")) return "degraded";
    return "operational";
  }, [checks]);

  const overallLabel = useMemo(() => {
    if (overall === "operational") return isFr ? "Tous les services sont opérationnels" : "All systems operational";
    if (overall === "degraded") return isFr ? "Performance dégradée" : "Degraded performance";
    if (overall === "down") return isFr ? "Incident en cours" : "Incident in progress";
    return isFr ? "Vérification en cours…" : "Running checks…";
  }, [overall, isFr]);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:h-20 md:px-6">
          <a href="/" className="flex items-center gap-2">
            <img src={brandLogos.primary} alt={brand.name} className="h-12 md:h-14 w-auto" />
          </a>
          <button
            onClick={() => i18n.changeLanguage(isFr ? "en" : "fr")}
            className="text-xs font-medium uppercase tracking-wider text-foreground/60 transition-colors hover:text-foreground"
            aria-label="Change language"
          >
            {isFr ? "EN" : "FR"}
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {isFr ? "Statut de la plateforme" : "Platform status"}
            </p>
            <h1 className="mt-2 font-serif text-4xl tracking-tight md:text-5xl">
              {isFr ? "Statut des services" : "Service status"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground md:text-base">
              {isFr
                ? "Disponibilité en temps réel de l'application Eïa et de ses intégrations."
                : "Real-time availability of the Eïa platform and its integrations."}
            </p>
          </div>

          <Card
            className={cn(
              "mb-8 border-2 ring-1 transition-colors",
              statusMeta[overall].bg,
              statusMeta[overall].ring,
            )}
          >
            <CardContent className="flex items-center justify-between gap-4 p-6">
              <div className="flex items-center gap-4">
                <StatusIcon status={overall} />
                <div>
                  <div className={cn("text-lg font-semibold md:text-xl", statusMeta[overall].color)}>
                    {overallLabel}
                  </div>
                  {lastUpdated && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {isFr ? "Dernière vérification : " : "Last checked: "}
                      {lastUpdated.toLocaleString(isFr ? "fr-FR" : "en-US", {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      })}
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={runChecks}
                disabled={isRunning}
                className="shrink-0"
              >
                <RefreshCw className={cn("h-4 w-4", isRunning && "animate-spin")} />
                <span className="ml-2 hidden sm:inline">{isFr ? "Actualiser" : "Refresh"}</span>
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {checks.map((check) => (
              <Card key={check.id} className="border border-border/60">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="flex items-start gap-4">
                    <StatusIcon status={check.status} />
                    <div>
                      <div className="font-medium">{isFr ? check.labelFr : check.labelEn}</div>
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        {isFr ? check.descriptionFr : check.descriptionEn}
                      </div>
                      {check.error && (
                        <div className="mt-1 text-xs text-red-600">{check.error}</div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cn("text-sm font-medium", statusMeta[check.status].color)}>
                      {check.status === "operational" && (isFr ? "Opérationnel" : "Operational")}
                      {check.status === "degraded" && (isFr ? "Dégradé" : "Degraded")}
                      {check.status === "down" && (isFr ? "Indisponible" : "Down")}
                      {check.status === "checking" && (isFr ? "Vérification…" : "Checking…")}
                    </div>
                    {typeof check.responseTimeMs === "number" && check.status !== "checking" && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {check.responseTimeMs} ms
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-10 rounded-xl border border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
            <p>
              {isFr
                ? "Les vérifications sont effectuées automatiquement toutes les minutes depuis votre navigateur."
                : "Checks run automatically every minute from your browser."}
            </p>
            <p className="mt-2">
              {isFr ? "Pour signaler un incident, contactez " : "To report an incident, contact "}
              <a
                href={`mailto:${brand.legal.contactEmail}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {brand.legal.contactEmail}
              </a>
              .
            </p>
          </div>

          <div className="mt-8 text-center text-xs text-muted-foreground">
            <a href="/" className="hover:text-foreground">
              {isFr ? "← Retour à l'accueil" : "← Back to home"}
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Status;
