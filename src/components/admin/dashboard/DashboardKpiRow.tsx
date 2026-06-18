import { Euro, Info, Package, ShoppingBasket, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface DashboardKpiRowProps {
  totalSales: string;
  salesTrend: number;
  averageBasket: string;
}

export function DashboardKpiRow({ totalSales, salesTrend, averageBasket }: DashboardKpiRowProps) {
  const salesValue = totalSales === "0.00" ? "0 €" : `${totalSales} €`;
  const basketValue = averageBasket === "0.00" ? "0 €" : `${averageBasket} €`;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      {/* CA */}
      <Card className="border border-border bg-card">
        <CardContent className="p-5 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Euro className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <p className="text-sm font-medium text-muted-foreground tracking-wide">CA</p>
          </div>
          <p className="text-xl md:text-2xl font-medium text-foreground mb-3 tracking-tight whitespace-nowrap text-right tabular-nums">
            {salesValue}
          </p>
          <div className="mt-auto">
            {salesTrend !== 0 && (
              <div className={`flex items-center gap-2 ${salesTrend > 0 ? "text-success" : "text-destructive"}`}>
                {salesTrend > 0 ? (
                  <TrendingUp className="h-4 w-4 flex-shrink-0" strokeWidth={2.5} />
                ) : (
                  <TrendingDown className="h-4 w-4 flex-shrink-0" strokeWidth={2.5} />
                )}
                <p className="text-xs">
                  <span className="font-semibold">
                    {salesTrend > 0 ? "+" : "-"}
                    {Math.abs(salesTrend)}%
                  </span>
                  <span className="text-muted-foreground ml-1">vs période précédente</span>
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Panier moyen */}
      <Card className="border border-border bg-card">
        <CardContent className="p-5 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingBasket className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <p className="text-sm font-medium text-muted-foreground tracking-wide">Panier moyen</p>
          </div>
          <p className="text-xl md:text-2xl font-medium text-foreground mb-3 tracking-tight whitespace-nowrap text-right tabular-nums">
            {basketValue}
          </p>
        </CardContent>
      </Card>

      {/* Vente Retail — placeholder (produits en cabinet) */}
      <Card className="border border-border bg-card opacity-60">
        <CardContent className="p-5 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Package className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <p className="text-sm font-medium text-muted-foreground tracking-wide">Vente Retail</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>produits en cabinet</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Badge variant="secondary" className="ml-auto">soon</Badge>
          </div>
          <p className="text-xl md:text-2xl font-medium text-muted-foreground mb-3 tracking-tight whitespace-nowrap text-right tabular-nums">
            —
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
