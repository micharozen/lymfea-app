import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import PwaHeader from "@/components/pwa/PwaHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
}

const PwaWallet = () => {
  const { t } = useTranslation('pwa');
  const [period, setPeriod] = useState("this_month");
  const [connectingStripe, setConnectingStripe] = useState(false);

  const { data: earnings, isLoading, isFetching } = useQuery({
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
      };
    },
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: 'always', // Always refetch when mounting
    refetchOnWindowFocus: true,
  });

  const openStripe = () => {
    // Open Stripe Express dashboard for connected accounts
    if (earnings?.stripeAccountId) {
      window.open(`https://dashboard.stripe.com/express/${earnings.stripeAccountId}`, "_blank");
    } else {
      window.open("https://dashboard.stripe.com/", "_blank");
    }
  };

  const handleSetupStripe = async () => {
    setConnectingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-connect-account');

      if (error) {
        console.error('Error creating Stripe account:', error);
        toast.error(t('wallet.errorConnecting', 'Error connecting to Stripe'));
        return;
      }

      if (data?.url) {
        // Redirect to Stripe onboarding
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

  // Show simple loading state only on first load
  if (isLoading && !earnings) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] pb-24">
        <div className="px-6 pt-12 pb-6">
          <div className="text-center">
            <h1 className="text-base font-semibold text-foreground">
              {t('wallet.myEarnings', 'My earnings')}
            </h1>
          </div>
          <div className="text-center mt-8 mb-6">
            <div className="h-14 w-40 bg-muted/50 rounded-lg animate-pulse mx-auto" />
          </div>
        </div>
        <div className="mx-4 bg-white rounded-2xl shadow-sm">
          <div className="px-5 pt-5 pb-2">
            <div className="h-4 w-32 bg-muted/50 rounded animate-pulse" />
          </div>
          <div className="px-5 pb-5 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-muted/50 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-muted/50 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-muted/50 rounded animate-pulse" />
                </div>
                <div className="space-y-2 text-right">
                  <div className="h-4 w-16 bg-muted/50 rounded animate-pulse ml-auto" />
                  <div className="h-3 w-12 bg-muted/50 rounded animate-pulse ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const currentEarnings = earnings || { total: 0, payouts: [], stripeAccountId: null };

  return (
    <div className="h-full flex flex-col bg-muted/30">
      <PwaHeader
        title="Wallet"
        centerSlot={
          currentEarnings.stripeAccountId ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 text-base font-semibold text-foreground">
                Wallet
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
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
          ) : undefined
        }
      />

      {/* Content with Stripe */}
      {currentEarnings.stripeAccountId && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-4">
            {/* Period Label */}
            <p className="text-xs text-muted-foreground text-center mb-3">{getPeriodLabel()}</p>
            
            {/* Total Earnings */}
            <div className="text-center mb-4">
              <p className="text-4xl font-bold text-foreground tracking-tight">
                {formatTotal(currentEarnings.total)}
              </p>
            </div>

            {/* Open Stripe Button */}
            <button
              onClick={openStripe}
              className="flex items-center gap-2 mx-auto px-4 py-2 bg-muted rounded-full text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
            >
              <div className="w-5 h-5 bg-foreground rounded-full flex items-center justify-center">
                <span className="text-background text-xs font-bold">S</span>
              </div>
              Open Stripe
              <ChevronRight className="w-4 h-4" />
            </button>
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
                    {/* Hotel Image */}
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

                    {/* Info */}
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

                    {/* Amount & Date */}
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

      {/* Empty State - No Stripe Account */}
      {!currentEarnings.stripeAccountId && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-sm bg-background rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <div className="w-7 h-7 bg-foreground rounded-full flex items-center justify-center">
                <span className="text-background text-xs font-bold">S</span>
              </div>
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">
              {t('wallet.noStripeAccount', 'Connect your Stripe account')}
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              {t('wallet.noStripeAccountDesc', 'To receive your earnings, you need to connect a Stripe account.')}
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
                  {t('wallet.setupStripe', 'Set up Stripe')}
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