import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export function StatCard({ title, value, icon: Icon, trend }: StatCardProps) {
  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardContent className="p-5 flex flex-col h-full">
        <p className="text-sm font-semibold text-muted-foreground mb-3">
          {title}
        </p>
        <p className="text-3xl font-semibold text-foreground mb-3 tracking-tight whitespace-nowrap">
          {value}
        </p>
        <div className="mt-auto">
          {trend && (
            <div className={`flex items-center gap-2 ${trend.isPositive ? "text-success" : "text-destructive"}`}>
              {trend.isPositive ? (
                <TrendingUp className="h-5 w-5 flex-shrink-0" strokeWidth={2.5} />
              ) : (
                <TrendingDown className="h-5 w-5 flex-shrink-0" strokeWidth={2.5} />
              )}
              <p className="text-xs">
                <span className="font-semibold">{trend.value}</span>
                <span className="text-muted-foreground ml-1">Comparé aux 30 derniers jours</span>
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
