import { useMemo } from "react";
import { Link } from "react-router-dom";
import { differenceInDays, parseISO } from "date-fns";
import { AlertTriangle, Clock, Info } from "lucide-react";
import { useOrganizationSubscription } from "@/hooks/useOrganizationSubscription";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "danger";

interface BannerState {
  tone: Tone;
  title: string;
  detail?: string;
}

function tonalClasses(tone: Tone): string {
  switch (tone) {
    case "warning":
      return "border-yellow-300 bg-yellow-50 text-yellow-900";
    case "danger":
      return "border-red-300 bg-red-50 text-red-900";
    default:
      return "border-blue-200 bg-blue-50 text-blue-900";
  }
}

export function SubscriptionBanner() {
  const { data, isLoading } = useOrganizationSubscription();
  const { t } = useTranslation("admin");

  const state = useMemo<BannerState | null>(() => {
    if (!data?.subscription) return null;
    const sub = data.subscription;

    if (sub.status === "past_due") {
      return {
        tone: "danger",
        title: t(
          "billing.banner.pastDue.title",
          "Payment failed — update your card",
        ),
        detail: t(
          "billing.banner.pastDue.detail",
          "Your latest invoice could not be charged. Update your payment method to keep your subscription active.",
        ),
      };
    }

    if (
      sub.status === "unpaid" ||
      sub.status === "incomplete" ||
      sub.status === "incomplete_expired"
    ) {
      return {
        tone: "danger",
        title: t(
          "billing.banner.unpaid.title",
          "Subscription suspended",
        ),
        detail: t(
          "billing.banner.unpaid.detail",
          "Resume billing from the subscription page to restore full access.",
        ),
      };
    }

    if (sub.cancel_at_period_end && sub.current_period_end) {
      const days = differenceInDays(parseISO(sub.current_period_end), new Date());
      return {
        tone: "warning",
        title: t("billing.banner.cancelScheduled.title", {
          days,
          defaultValue: `Subscription ends in ${days} day(s)`,
        }),
        detail: t(
          "billing.banner.cancelScheduled.detail",
          "You will lose access at the end of the current billing period. Resume anytime.",
        ),
      };
    }

    if (sub.status === "trialing" && sub.trial_end) {
      const days = differenceInDays(parseISO(sub.trial_end), new Date());
      if (days >= 0 && days <= 7) {
        return {
          tone: "info",
          title: t("billing.banner.trialEnding.title", {
            days,
            defaultValue: `Trial ends in ${days} day(s)`,
          }),
        };
      }
    }

    return null;
  }, [data?.subscription, t]);

  if (isLoading || !state) return null;

  const Icon = state.tone === "danger" ? AlertTriangle : state.tone === "warning" ? Clock : Info;

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b px-4 py-2 text-sm",
        tonalClasses(state.tone),
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{state.title}</span>
        {state.detail && (
          <span className="ml-2 text-current/80">{state.detail}</span>
        )}
      </div>
      <Link
        to="/admin/billing"
        className="shrink-0 underline underline-offset-2 hover:opacity-80"
      >
        {t("billing.banner.cta", "Manage subscription")}
      </Link>
    </div>
  );
}
