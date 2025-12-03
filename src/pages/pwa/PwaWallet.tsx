import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Payout {
  id: string;
  booking_id: number;
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
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState<EarningsData>({
    total: 0,
    payouts: [],
    stripeAccountId: null,
  });
  const [period, setPeriod] = useState("this_month");

  useEffect(() => {
    fetchEarnings();
  }, [period]);

  const fetchEarnings = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get hairdresser profile
      const { data: hairdresser } = await supabase
        .from("hairdressers")
        .select("id, stripe_account_id")
        .eq("user_id", user.id)
        .single();

      if (!hairdresser) return;

      // Calculate date range based on period
      let startDate: Date;
      let endDate: Date;

      switch (period) {
        case "last_month":
          startDate = startOfMonth(subMonths(new Date(), 1));
          endDate = endOfMonth(subMonths(new Date(), 1));
          break;
        case "last_3_months":
          startDate = startOfMonth(subMonths(new Date(), 3));
          endDate = new Date();
          break;
        case "this_month":
        default:
          startDate = startOfMonth(new Date());
          endDate = new Date();
          break;
      }

      // Fetch completed bookings for this hairdresser
      const { data: bookings, error } = await supabase
        .from("bookings")
        .select(`
          id,
          booking_id,
          hotel_name,
          hotel_id,
          total_price,
          status,
          signed_at,
          payment_status
        `)
        .eq("hairdresser_id", hairdresser.id)
        .eq("status", "Complété")
        .gte("signed_at", startDate.toISOString())
        .lte("signed_at", endDate.toISOString())
        .order("signed_at", { ascending: false });

      if (error) throw error;

      // Fetch hotel images
      const hotelIds = [...new Set(bookings?.map(b => b.hotel_id) || [])];
      const { data: hotels } = await supabase
        .from("hotels")
        .select("id, image, hairdresser_commission")
        .in("id", hotelIds);

      const hotelsMap = new Map(hotels?.map(h => [h.id, h]) || []);

      // Calculate payouts (total_price - commission)
      const payouts: Payout[] = (bookings || []).map(booking => {
        const hotel = hotelsMap.get(booking.hotel_id);
        const commission = hotel?.hairdresser_commission || 0;
        const amount = booking.total_price * (1 - commission / 100);
        
        return {
          id: booking.id,
          booking_id: booking.booking_id,
          hotel_name: booking.hotel_name || "Unknown Hotel",
          hotel_image: hotel?.image || null,
          amount: amount,
          status: booking.payment_status === "paid" ? "completed" : "pending",
          date: booking.signed_at || "",
        };
      });

      const total = payouts.reduce((sum, p) => sum + p.amount, 0);

      setEarnings({
        total,
        payouts,
        stripeAccountId: hairdresser.stripe_account_id,
      });
    } catch (error) {
      console.error("Error fetching earnings:", error);
      toast.error(t('common:errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const openStripe = () => {
    window.open("https://dashboard.stripe.com/", "_blank");
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

  const formatAmount = (amount: number) => {
    return amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-6 pt-12 pb-8">
        <div className="text-center">
          <h1 className="text-base font-semibold text-foreground mb-1">
            {t('wallet.myEarnings', 'My earnings')}
          </h1>
          
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 mx-auto text-sm text-muted-foreground">
              {getPeriodLabel()}
              <ChevronDown className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
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
        </div>

        {/* Total Earnings */}
        <div className="text-center mt-8 mb-6">
          {loading ? (
            <div className="h-14 w-48 bg-muted/50 rounded-lg animate-pulse mx-auto" />
          ) : (
            <p className="text-5xl font-bold text-foreground">
              €{formatAmount(earnings.total).replace(',', ' ').replace('.', ',')}
            </p>
          )}
        </div>

        {/* Open Stripe Button */}
        <button
          onClick={openStripe}
          className="flex items-center gap-2 mx-auto px-4 py-2 bg-muted rounded-full text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
          </svg>
          Open Stripe
          <ChevronDown className="w-4 h-4 -rotate-90" />
        </button>
      </div>

      {/* Payouts List */}
      <div className="px-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          {t('wallet.latestPayouts', 'Latest Payouts')}
        </h2>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
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
        ) : earnings.payouts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t('wallet.noPayouts', 'No payouts for this period')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {earnings.payouts.map((payout) => (
              <div
                key={payout.id}
                className="flex items-center gap-4"
              >
                {/* Hotel Image */}
                <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
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
                  <p className="text-sm font-medium text-foreground truncate">
                    {payout.hotel_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ref {payout.booking_id} • {" "}
                    <span className={payout.status === "completed" ? "text-foreground" : "text-muted-foreground"}>
                      {payout.status === "completed" 
                        ? t('wallet.completed', 'Completed') 
                        : t('wallet.pending', 'Pending')}
                    </span>
                  </p>
                </div>

                {/* Amount & Date */}
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-foreground">
                    €{formatAmount(payout.amount).replace('.', ',')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {payout.date ? format(new Date(payout.date), "MMM dd") : "-"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PwaWallet;
