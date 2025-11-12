import { LucideIcon } from "lucide-react";
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
    <Card className="border border-border bg-card shadow-sm h-full">
      <CardContent className="p-6">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            {title}
          </p>
          <p className="text-3xl font-semibold text-foreground tracking-tight">
            {value}
          </p>
          <div className="min-h-[20px]">
            {trend && (
              <p className={`text-xs font-medium flex items-center gap-1 ${trend.isPositive ? "text-success" : "text-destructive"}`}>
                <span>{trend.isPositive ? "↑" : "↓"}</span>
                <span>{trend.value} vs 30 derniers jours</span>
              </p>
            )}
            {!trend && (
              <p className="text-xs text-muted-foreground">Cliquez pour voir la liste</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
