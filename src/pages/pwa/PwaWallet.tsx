import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ExternalLink } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      toast.error("Erreur lors du chargement des revenus");
    } finally {
      setLoading(false);
    }
  };

  const openStripe = () => {
    if (earnings.stripeAccountId) {
      window.open("https://dashboard.stripe.com/", "_blank");
    } else {
      toast.error("Compte Stripe non configuré");
    }
  };

  const getPeriodLabel = () => {
    switch (period) {
      case "last_month":
        return "Last Month";
      case "last_3_months":
        return "Last 3 Months";
      case "this_month":
      default:
        return "This Month";
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-background px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold text-foreground">My earnings</h1>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-auto border-0 bg-transparent p-0 h-auto focus:ring-0">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <SelectValue />
                <ChevronDown className="w-4 h-4" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="last_3_months">Last 3 Months</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Total Earnings */}
        <div className="mt-8 mb-6">
          {loading ? (
            <div className="h-16 bg-muted/50 rounded-lg animate-pulse" />
          ) : (
            <p className="text-5xl font-bold text-foreground">
              €{earnings.total.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>

        {/* Open Stripe Button */}
        <button
          onClick={openStripe}
          className="w-full bg-primary text-primary-foreground rounded-full py-3 px-6 text-sm font-medium hover:bg-primary/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          Open Stripe
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {/* Payouts List */}
      <div className="px-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Latest Payouts
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : earnings.payouts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Aucun paiement pour cette période</p>
          </div>
        ) : (
          <div className="space-y-3">
            {earnings.payouts.map((payout) => (
              <div
                key={payout.id}
                className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border"
              >
                {/* Hotel Image */}
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      Ref #{payout.booking_id}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        payout.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {payout.status === "completed" ? "Completed" : "Pending"}
                    </span>
                  </div>
                </div>

                {/* Amount & Date */}
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-foreground">
                    €{payout.amount.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {payout.date ? format(new Date(payout.date), "dd MMM") : "-"}
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
