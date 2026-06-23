import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  alignRight?: boolean;
  trend?: {
    value: string;
    isPositive: boolean;
    periodLabel?: string;
  };
}

export function StatCard({ title, value, icon: Icon, alignRight, trend }: StatCardProps) {
  return (
    <Card className="border border-border bg-card">
      <CardContent className="p-5 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-3">
          {Icon && (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" strokeWidth={2.25} />
            </span>
          )}
          <p className="text-sm font-medium text-muted-foreground tracking-wide">
            {title}
          </p>
        </div>
        <p
          className={`text-xl md:text-2xl font-medium text-foreground mb-3 tracking-tight whitespace-nowrap${
            alignRight ? " text-right tabular-nums" : ""
          }`}
        >
          {value}
        </p>
        <div className="mt-auto">
          {trend && (
            <div className={`flex items-center gap-2 ${trend.isPositive ? "text-success" : "text-destructive"}`}>
              {trend.isPositive ? (
                <TrendingUp className="h-4 w-4 flex-shrink-0" strokeWidth={2.5} />
              ) : (
                <TrendingDown className="h-4 w-4 flex-shrink-0" strokeWidth={2.5} />
              )}
              <p className="text-xs">
                <span className="font-semibold">{trend.isPositive ? "+" : "-"}{trend.value}</span>
                <span className="text-muted-foreground ml-1">{trend.periodLabel || "vs période précédente"}</span>
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
