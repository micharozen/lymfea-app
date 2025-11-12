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
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-normal text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-bold text-foreground mb-1">{value}</div>
        {trend && (
          <p className={`text-xs flex items-center gap-1 ${trend.isPositive ? "text-success" : "text-destructive"}`}>
            <span>{trend.isPositive ? "↑" : "↓"}</span>
            <span>{trend.value} Comparé aux 30 derniers jours</span>
          </p>
        )}
        {!trend && (
          <p className="text-xs text-muted-foreground">Cliquez ici pour voir la liste des réservations</p>
        )}
      </CardContent>
    </Card>
  );
}
