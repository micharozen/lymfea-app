import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { completeOnboardingVenue } from "@/lib/billing";

type Phase = "polling" | "creating" | "error";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 20;
const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

async function fetchSubscriptionStatus(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;
  const { data: adminRow } = await supabase
    .from("admins")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const orgId = adminRow?.organization_id;
  if (!orgId) return null;
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("organization_id", orgId)
    .maybeSingle();
  return (sub?.status as string | undefined) ?? null;
}

export default function Complete() {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const { refresh } = useUser();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  const [phase, setPhase] = useState<Phase>("polling");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const attemptsRef = useRef(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    async function run() {
      // Phase 1: poll until subscription becomes trialing/active.
      while (!cancelled && attemptsRef.current < POLL_MAX_ATTEMPTS) {
        attemptsRef.current += 1;
        const status = await fetchSubscriptionStatus();
        if (status && ACTIVE_STATUSES.has(status)) break;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      if (cancelled) return;
      if (attemptsRef.current >= POLL_MAX_ATTEMPTS) {
        setErrorMessage(t("onboarding.complete.timeout"));
        setPhase("error");
        return;
      }

      // Phase 2: create the venue from pending_venue metadata.
      setPhase("creating");
      const { data, error } = await completeOnboardingVenue();
      if (cancelled) return;

      if (error || !data?.venue_id) {
        setErrorMessage(error?.message ?? t("onboarding.errors.venueFailed"));
        setPhase("error");
        return;
      }

      // Phase 3: refresh user context (org/role/hotelIds) then navigate.
      await refresh();
      if (cancelled) return;
      navigate(`/admin/places/${data.venue_id}`, { replace: true });
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, refresh, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm text-center space-y-4">
        {phase === "error" ? (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-lg font-semibold">{t("onboarding.complete.errorTitle")}</h1>
            <p className="text-sm text-muted-foreground">
              {errorMessage ?? t("onboarding.complete.error")}
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  attemptsRef.current = 0;
                  startedRef.current = false;
                  setErrorMessage(null);
                  setPhase("polling");
                }}
              >
                {t("onboarding.complete.retry")}
              </Button>
              <Button variant="ghost" onClick={() => navigate("/admin/billing")}>
                {t("onboarding.complete.goToBilling")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              {phase === "polling" ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <CheckCircle2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <h1 className="text-lg font-semibold">
              {phase === "polling"
                ? t("onboarding.complete.polling")
                : t("onboarding.complete.creatingVenue")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("onboarding.complete.pleaseWait")}
            </p>
            {sessionId && (
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {sessionId.slice(0, 14)}…
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
