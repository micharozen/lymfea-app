import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

const OAUTH_INTENT_KEY = "oauth_intent";

interface OAuthIntent {
  next?: string;
}

function readIntent(): OAuthIntent | null {
  try {
    const raw = localStorage.getItem(OAUTH_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "next" in parsed) {
      const next = (parsed as { next?: unknown }).next;
      if (typeof next === "string" && next.startsWith("/")) {
        return { next };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const { t } = useTranslation("admin");

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      const url = new URL(window.location.href);
      const errorDescription =
        url.searchParams.get("error_description") ?? url.searchParams.get("error");

      if (errorDescription) {
        toast.error(decodeURIComponent(errorDescription));
        localStorage.removeItem(OAUTH_INTENT_KEY);
        if (!cancelled) navigate("/signup", { replace: true });
        return;
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          toast.error(error.message || t("onboarding.errors.oauthFailed"));
          localStorage.removeItem(OAUTH_INTENT_KEY);
          if (!cancelled) navigate("/signup", { replace: true });
          return;
        }
      }

      const intent = readIntent();
      localStorage.removeItem(OAUTH_INTENT_KEY);
      const next = intent?.next ?? "/signup";
      if (!cancelled) navigate(next, { replace: true });
    }

    handleCallback();
    return () => {
      cancelled = true;
    };
  }, [navigate, t]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
