import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Package, ShoppingCart } from "lucide-react";
import { SellBundleDialog } from "@/components/admin/SellBundleDialog";

interface CustomerCuresSectionProps {
  customerId: string;
  customerName: string;
}

export function CustomerCuresSection({ customerId, customerName }: CustomerCuresSectionProps) {
  const { t } = useTranslation("admin");
  const [sellDialogOpen, setSellDialogOpen] = useState(false);

  const { data: bundles, refetch } = useQuery({
    queryKey: ["customer-bundles", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_treatment_bundles")
        .select("*, treatment_bundles(name), hotels(name)")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });

  const activeBundles = bundles?.filter((b) => b.status === "active") || [];
  const otherBundles = bundles?.filter((b) => b.status !== "active") || [];

  const getStatusBadge = (status: string) => {
    const config: Record<string, { className: string; label: string }> = {
      active: { className: "bg-green-500/10 text-green-700", label: t("cures.status.active") },
      completed: { className: "bg-blue-500/10 text-blue-700", label: t("cures.status.completed") },
      expired: { className: "bg-orange-500/10 text-orange-700", label: t("cures.status.expired") },
      cancelled: { className: "bg-red-500/10 text-red-700", label: t("cures.status.cancelled") },
    };
    const c = config[status] || { className: "", label: status };
    return <Badge variant="secondary" className={cn("text-[10px] px-2 py-0.5", c.className)}>{c.label}</Badge>;
  };

  return (
    <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Package className="h-4 w-4" />
          {t("cures.title")}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setSellDialogOpen(true)}>
          <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
          {t("cures.sellCure")}
        </Button>
      </div>

      {(!bundles || bundles.length === 0) ? (
        <p className="text-sm text-muted-foreground">Aucune cure pour ce client</p>
      ) : (
        <div className="space-y-2">
          {[...activeBundles, ...otherBundles].map((bundle) => {
            const remaining = bundle.total_sessions - bundle.used_sessions;
            const progressPct = (bundle.used_sessions / bundle.total_sessions) * 100;
            return (
              <div
                key={bundle.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border",
                  bundle.status === "active" ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20" : "border-border"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {(bundle as any).treatment_bundles?.name || "-"}
                    </span>
                    {getStatusBadge(bundle.status)}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1.5 flex-1">
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {bundle.used_sessions}/{bundle.total_sessions} seances
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Exp. {new Date(bundle.expires_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SellBundleDialog
        open={sellDialogOpen}
        onOpenChange={setSellDialogOpen}
        prefilledCustomerId={customerId}
        prefilledCustomerName={customerName}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
