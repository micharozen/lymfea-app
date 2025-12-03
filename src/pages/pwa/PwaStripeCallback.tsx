import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const PwaStripeCallback = () => {
  const { t } = useTranslation('pwa');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'refresh'>('loading');

  useEffect(() => {
    const success = searchParams.get("success");
    const refresh = searchParams.get("refresh");

    if (success === "true") {
      setStatus('success');
      // Redirect to wallet after 2 seconds
      setTimeout(() => {
        navigate("/pwa/wallet", { replace: true });
      }, 2000);
    } else if (refresh === "true") {
      setStatus('refresh');
      // Redirect to wallet after 2 seconds to retry
      setTimeout(() => {
        navigate("/pwa/wallet", { replace: true });
      }, 2000);
    } else {
      // Unknown state, redirect to wallet
      navigate("/pwa/wallet", { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center max-w-sm w-full">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t('wallet.processing', 'Processing...')}
            </h2>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t('wallet.stripeConnected', 'Stripe account connected!')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('wallet.redirecting', 'Redirecting to your wallet...')}
            </p>
          </>
        )}

        {status === 'refresh' && (
          <>
            <XCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t('wallet.stripeIncomplete', 'Setup incomplete')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('wallet.tryAgain', 'Please try again to complete the setup.')}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default PwaStripeCallback;
