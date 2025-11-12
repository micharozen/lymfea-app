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
      <CardContent className="p-6 flex flex-col h-full">
        <p className="text-sm text-muted-foreground mb-4">
          {title}
        </p>
        <p className="text-4xl font-semibold text-foreground mb-4 tracking-tight">
          {value}
        </p>
        <div className="mt-auto">
          {trend && (
            <p className={`text-sm font-medium flex items-center gap-1 ${trend.isPositive ? "text-success" : "text-destructive"}`}>
              <span>{trend.isPositive ? "↑" : "↓"}</span>
              <span>{trend.value} Comparé aux 30 derniers jours</span>
            </p>
          )}
          {!trend && (
            <p className="text-sm text-muted-foreground">Cliquez pour voir la liste</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
