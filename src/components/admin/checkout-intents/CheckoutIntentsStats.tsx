import { useTranslation } from "react-i18next";
import { BellRing, ShoppingCart, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckoutIntentsKpis {
  total: number;
  converted: number;
  abandoned: number;
  reminded: number;
  conversionRate: number;
  abandonedValue: string;
}

interface CheckoutIntentsStatsProps {
  kpis: CheckoutIntentsKpis;
}

export function CheckoutIntentsStats({ kpis }: CheckoutIntentsStatsProps) {
  const { t } = useTranslation("admin");

  const remindRate = kpis.abandoned ? Math.round((kpis.reminded / kpis.abandoned) * 100) : 0;
  const convertedShare = kpis.total ? (kpis.converted / kpis.total) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <ConversionCard rate={kpis.conversionRate} converted={kpis.converted} total={kpis.total} />

        <StatCard
          icon={ShoppingCart}
          label={t("checkoutIntents.kpis.abandonedValue")}
          value={kpis.abandonedValue}
          hint={t("checkoutIntents.kpis.abandonedValueHint", { count: kpis.abandoned })}
          accent
        />

        <StatCard
          icon={BellRing}
          label={t("checkoutIntents.kpis.reminded")}
          value={`${kpis.reminded}`}
          hint={t("checkoutIntents.kpis.remindedHint", { count: Math.max(kpis.abandoned - kpis.reminded, 0) })}
          progress={remindRate}
        />
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-gold-600" />
            {t("checkoutIntents.status.converted")}
            <span className="font-medium text-foreground tabular-nums">{kpis.converted}</span>
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{kpis.abandoned}</span>
            {t("checkoutIntents.status.abandoned")}
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted-foreground/15">
          <div
            className="bg-gold-600 transition-all duration-500"
            style={{ width: `${convertedShare}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ConversionCard({ rate, converted, total }: { rate: number; converted: number; total: number }) {
  const { t } = useTranslation("admin");
  const radius = 34;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <div className="relative h-[84px] w-[84px] shrink-0">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={radius} className="fill-none stroke-muted-foreground/15" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r={radius}
            className="fill-none stroke-gold-600 transition-all duration-700"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - rate / 100)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xl font-medium tabular-nums">
          {rate}%
        </span>
      </div>

      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          {t("checkoutIntents.kpis.conversionRate")}
        </p>
        <p className="mt-1 text-sm text-foreground">
          {t("checkoutIntents.kpis.conversionHint", { converted, total })}
        </p>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: typeof ShoppingCart;
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
  progress?: number;
}

function StatCard({ icon: Icon, label, value, hint, accent, progress }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-3xl font-medium tabular-nums leading-none",
          accent && "text-gold-600",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>

      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted-foreground/15">
          <div
            className="h-full bg-gold-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
