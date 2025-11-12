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
    <Card className="border border-border bg-card shadow-sm">
      <CardContent className="p-5 flex flex-col h-full">
        <p className="text-sm font-semibold text-muted-foreground mb-3">
          {title}
        </p>
        <p className="text-3xl font-semibold text-foreground mb-3 tracking-tight">
          {value}
        </p>
        <div className="mt-auto">
          {trend && (
            <p className={`text-xs flex items-center gap-1 ${trend.isPositive ? "text-success" : "text-destructive"}`}>
              <span>{trend.isPositive ? "↑" : "↓"}</span>
              <span>{trend.value} Comparé aux 30 derniers jours</span>
            </p>
          )}
          {!trend && (
            <p className="text-xs text-muted-foreground">Cliquez pour voir la liste</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
