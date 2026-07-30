import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

interface CallbackResult {
  success: boolean;
  hotelId: string;
  accountId: string;
  livemode: boolean;
}

/**
 * Edge function completing the exchange, per provider. The route namespace is
 * generic but each provider needs its own implementation (token endpoint, env
 * vars, response shape), so the mapping lives here.
 */
const CALLBACK_FUNCTIONS: Record<string, string> = {
  stripe: "stripe-oauth-callback",
};

/**
 * Redirect target of a payment provider's OAuth consent screen — for Stripe,
 * declared in saoma/stripe-app.json → allowed_redirect_uris.
 *
 * The provider sends back `code` + `state`; the exchange itself happens
 * server-side, where the state is validated and the tokens land in Vault.
 */
export default function PaymentOAuthCallback() {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const { provider } = useParams<{ provider: string }>();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  // Guards against React 18 StrictMode double-invocation: the authorization
  // code and the state row are both single-use, so a second call would fail.
  const exchangeStarted = useRef(false);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    // The venue declined the consent screen, or the provider rejected us.
    if (providerError) {
      setError(searchParams.get("error_description") || providerError);
      return;
    }

    const functionName = provider ? CALLBACK_FUNCTIONS[provider] : undefined;
    if (!functionName) {
      setError(t("payment.oauthUnknownProvider", { provider: provider ?? "?" }));
      return;
    }

    if (!code || !state) {
      setError(t("payment.oauthMissingParams"));
      return;
    }

    async function completeConnection() {
      const { data, error: invokeError } = await invokeEdgeFunction<
        { code: string; state: string },
        CallbackResult
      >(functionName as string, {
        body: { code: code as string, state: state as string },
        logContext: { flow: "payment-oauth", provider },
      });

      if (invokeError || !data?.success) {
        setError(invokeError?.message || t("payment.oauthFailed"));
        return;
      }

      toast.success(t("payment.oauthConnected"));
      navigate(`/admin/places/${data.hotelId}`, { replace: true });
    }

    completeConnection();
  }, [code, state, providerError, provider, navigate, searchParams, t]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <XCircle className="h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <p className="font-medium">{t("payment.oauthFailed")}</p>
          <p className="text-sm text-muted-foreground max-w-md">{error}</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/places")}>
          {t("payment.backToPlaces")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{t("payment.oauthConnecting")}</p>
    </div>
  );
}
