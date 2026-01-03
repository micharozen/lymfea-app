import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PwaHeader from "@/components/pwa/PwaHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

interface Payout {
  id: string;
  booking_id: number | null;
  hotel_name: string;
  hotel_image: string | null;
  amount: number;
  status: string;
  date: string;
}

interface EarningsData {
  total: number;
  payouts: Payout[];
  stripeAccountId: string | null;
  stripeOnboardingCompleted: boolean;
}

const PwaWallet = () => {
  const { t } = useTranslation('pwa');
  const [searchParams] = useSearchParams();
  const [period, setPeriod] = useState("this_month");
  const [connectingStripe, setConnectingStripe] = useState(false);
  const queryClient = useQueryClient();

  // Check URL params for Stripe callback
  const successParam = searchParams.get("success");
  const refreshParam = searchParams.get("refresh");

  useEffect(() => {
    if (successParam === "true") {
      toast.success(t('wallet.stripeConnected', 'Stripe account connected successfully!'));
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["wallet-earnings"] });
    } else if (refreshParam === "true") {
      toast.error(t('wallet.onboardingIncomplete', 'Stripe setup incomplete. Please try again.'));
    }
  }, [successParam, refreshParam, queryClient, t]);

  const { data: earnings, isLoading } = useQuery({
    queryKey: ["wallet-earnings", period],
    queryFn: async (): Promise<EarningsData> => {
      const { data, error } = await supabase.functions.invoke('get-hairdresser-earnings', {
        body: { period },
      });

      if (error) {
        console.error('Error fetching earnings:', error);
        toast.error(t('wallet.errorFetching', 'Error fetching earnings'));
        throw error;
      }

      return {
        total: data.total || 0,
        payouts: data.payouts || [],
        stripeAccountId: data.stripeAccountId,
        stripeOnboardingCompleted: data.stripeOnboardingCompleted || false,
      };
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const [stripeUrl, setStripeUrl] = useState<string | null>(null);
  const [loadingStripeUrl, setLoadingStripeUrl] = useState(false);

  // Pre-fetch Stripe dashboard URL when earnings are loaded
  useEffect(() => {
    const fetchStripeUrl = async () => {
      if (earnings?.stripeAccountId && earnings?.stripeOnboardingCompleted) {
        setLoadingStripeUrl(true);
        try {
          const { data, error } = await supabase.functions.invoke('generate-stripe-login-link', {
            body: {},
          });
          if (!error && data?.url) {
            setStripeUrl(data.url);
          }
        } catch (err) {
          console.error('Error pre-fetching Stripe URL:', err);
        } finally {
          setLoadingStripeUrl(false);
        }
      }
    };
    fetchStripeUrl();
  }, [earnings?.stripeAccountId, earnings?.stripeOnboardingCompleted]);

  const openStripe = async (e: React.MouseEvent) => {
    // If we have a pre-fetched URL, let the <a> tag handle it naturally
    if (stripeUrl) {
      return; // Let the anchor tag open the link
    }
    
    // Otherwise prevent default and fetch the URL
    e.preventDefault();
    
    if (earnings?.stripeAccountId) {
      setLoadingStripeUrl(true);
      try {
        const { data, error } = await supabase.functions.invoke('generate-stripe-login-link', {
          body: {},
        });
        
        if (error) {
          console.error('Error generating Stripe login link:', error);
          toast.error(t('wallet.errorOpeningStripe', 'Error opening Stripe dashboard'));
          return;
        }
        
        if (data?.url) {
          setStripeUrl(data.url);
          // Create a temporary anchor and click it to open in new window
          const a = document.createElement('a');
          a.href = data.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          toast.error(t('wallet.errorOpeningStripe', 'Error opening Stripe dashboard'));
        }
      } catch (err) {
        console.error('Error opening Stripe:', err);
        toast.error(t('wallet.errorOpeningStripe', 'Error opening Stripe dashboard'));
      } finally {
        setLoadingStripeUrl(false);
      }
    }
  };

  const handleSetupStripe = async () => {
    setConnectingStripe(true);
    try {
      // Step 1: Create connected account
      const { data: accountData, error: accountError } = await supabase.functions.invoke('create-connect-account');

      if (accountError) {
        console.error('Error creating Stripe account:', accountError);
        toast.error(t('wallet.errorConnecting', 'Error connecting to Stripe'));
        return;
      }

      if (!accountData?.stripeAccountId) {
        toast.error(t('wallet.errorConnecting', 'Error connecting to Stripe'));
        return;
      }

      // Step 2: Generate onboarding link
      const { data: linkData, error: linkError } = await supabase.functions.invoke('generate-onboarding-link');

      if (linkError) {
        console.error('Error generating onboarding link:', linkError);
        toast.error(t('wallet.errorConnecting', 'Error connecting to Stripe'));
        return;
      }

      if (linkData?.url) {
        // Redirect to Stripe onboarding
        window.location.href = linkData.url;
      } else {
        toast.error(t('wallet.errorConnecting', 'Error connecting to Stripe'));
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(t('wallet.errorConnecting', 'Error connecting to Stripe'));
    } finally {
      setConnectingStripe(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setConnectingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-onboarding-link');

      if (error) {
        console.error('Error generating onboarding link:', error);
        toast.error(t('wallet.errorConnecting', 'Error connecting to Stripe'));
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error(t('wallet.errorConnecting', 'Error connecting to Stripe'));
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(t('wallet.errorConnecting', 'Error connecting to Stripe'));
    } finally {
      setConnectingStripe(false);
    }
  };

  const getPeriodLabel = () => {
    switch (period) {
      case "last_month":
        return t('wallet.lastMonth', 'Last Month');
      case "last_3_months":
        return t('wallet.last3Months', 'Last 3 Months');
      case "this_month":
      default:
        return t('wallet.thisMonth', 'This Month');
    }
  };

  const formatPrice = (amount: number) => {
    return `${amount.toFixed(2).replace('.', ',')} €`;
  };

  const formatTotal = (amount: number) => {
    const parts = amount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${parts} €`;
  };

  // Show skeleton while loading
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col bg-muted/30">
        <PwaHeader title="Wallet" />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-sm w-full bg-background rounded-2xl shadow-sm p-8">
            {/* Icon skeleton */}
            <div className="flex justify-center mb-4">
              <Skeleton className="w-14 h-14 rounded-full" />
            </div>
            {/* Title skeleton */}
            <Skeleton className="h-5 w-3/4 mx-auto mb-3" />
            {/* Description skeleton */}
            <Skeleton className="h-4 w-full mx-auto mb-2" />
            <Skeleton className="h-4 w-5/6 mx-auto mb-5" />
            {/* Button skeleton */}
            <div className="flex justify-center">
              <Skeleton className="h-10 w-40 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentEarnings = earnings || { total: 0, payouts: [], stripeAccountId: null, stripeOnboardingCompleted: false };
  const hasStripeAccount = !!currentEarnings.stripeAccountId;
  const isOnboardingComplete = currentEarnings.stripeOnboardingCompleted;

  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      <PwaHeader title="Wallet" />

      {/* Content with completed Stripe onboarding */}
      {hasStripeAccount && isOnboardingComplete && (
        <div className="flex-1 min-h-0">
          <div className="px-6 pt-4">
            {/* Status Badge */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-600 font-medium">
                {t('wallet.accountActive', 'Account Active')}
              </span>
            </div>

            {/* Period Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center justify-center gap-1 mx-auto text-xs text-muted-foreground mb-3">
                {getPeriodLabel()}
                <ChevronDown className="w-3 h-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="bg-background">
                <DropdownMenuItem onClick={() => setPeriod("this_month")}>
                  {t('wallet.thisMonth', 'This Month')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("last_month")}>
                  {t('wallet.lastMonth', 'Last Month')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("last_3_months")}>
                  {t('wallet.last3Months', 'Last 3 Months')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Total Earnings */}
            <div className="text-center mb-4">
              <p className="text-4xl font-bold text-foreground tracking-tight">
                {formatTotal(currentEarnings.total)}
              </p>
            </div>

            {/* Open Stripe Button - Use <a> tag to force external browser on iOS PWA */}
            <div className="w-full flex justify-center items-center">
              <a
                href={stripeUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={openStripe}
                className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
              >
                {loadingStripeUrl ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <div className="w-5 h-5 bg-foreground rounded-full flex items-center justify-center">
                    <span className="text-background text-xs font-bold">S</span>
                  </div>
                )}
                {t('wallet.viewDashboard', 'View Stripe Dashboard')}
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Payouts Card */}
          <div className="mx-4 mt-4 bg-background rounded-2xl shadow-sm mb-4">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('wallet.latestPayouts', 'Latest Payouts')}
              </h2>
            </div>

            {currentEarnings.payouts.length === 0 ? (
              <div className="px-5 pb-5 text-center py-8">
                <p className="text-muted-foreground text-sm">{t('wallet.noPayouts', 'No payouts for this period')}</p>
              </div>
            ) : (
              <div className="px-5 pb-5 space-y-4">
                {currentEarnings.payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
                      {payout.hotel_image ? (
                        <img
                          src={payout.hotel_image}
                          alt={payout.hotel_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {payout.hotel_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ref {payout.booking_id} •{" "}
                        <span className={payout.status === "completed" ? "text-foreground" : ""}>
                          {payout.status === "completed" 
                            ? t('wallet.completed', 'Completed') 
                            : t('wallet.pending', 'Pending')}
                        </span>
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-foreground">
                        {formatPrice(payout.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payout.date ? format(new Date(payout.date), "MMM dd") : "-"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stripe account exists but onboarding incomplete */}
      {hasStripeAccount && !isOnboardingComplete && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-sm bg-background rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">
              {t('wallet.completeSetup', 'Complete your setup')}
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              {t('wallet.completeSetupDesc', 'Your Stripe account is created but you need to complete verification to receive payments.')}
            </p>
            <button
              onClick={handleCompleteOnboarding}
              disabled={connectingStripe}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-full text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
            >
              {connectingStripe ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('wallet.connecting', 'Connecting...')}
                </>
              ) : (
                <>
                  {t('wallet.continueSetup', 'Continue Setup')}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Empty State - No Stripe Account */}
      {!hasStripeAccount && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-sm bg-background rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <div className="w-7 h-7 bg-foreground rounded-full flex items-center justify-center">
                <span className="text-background text-xs font-bold">S</span>
              </div>
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">
              {t('wallet.activateWallet', 'Activate your Wallet')}
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              {t('wallet.activateWalletDesc', 'To receive your earnings, you need to set up your payment account.')}
            </p>
            <button
              onClick={handleSetupStripe}
              disabled={connectingStripe}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-full text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
            >
              {connectingStripe ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('wallet.connecting', 'Connecting...')}
                </>
              ) : (
                <>
                  {t('wallet.setupPayments', 'Set up payments')}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PwaWallet;
