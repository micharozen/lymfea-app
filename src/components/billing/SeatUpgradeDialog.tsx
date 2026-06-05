import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  updateSubscriptionQuantity,
  type UpdateSeatsPreview,
} from "@/lib/billing";

interface SeatUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after Stripe confirms the seat increase (or before, if onProceed wants to act eagerly). */
  onConfirmed: () => void | Promise<void>;
  /** Number of seats to add (default +1). */
  delta?: number;
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function SeatUpgradeDialog({
  open,
  onOpenChange,
  onConfirmed,
  delta = 1,
}: SeatUpgradeDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<UpdateSeatsPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    updateSubscriptionQuantity({ delta, mode: "preview" })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) {
          setError(err?.message ?? t("billing.seatUpgrade.previewError", "Could not compute proration"));
          return;
        }
        if (data.mode !== "preview") {
          setError("Unexpected response");
          return;
        }
        setPreview(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, delta, t]);

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    const { data, error: err } = await updateSubscriptionQuantity({
      delta,
      mode: "confirm",
    });
    setConfirming(false);
    if (err || !data) {
      setError(err?.message ?? "Failed to update seats");
      return;
    }
    toast.success(
      t("billing.seatUpgrade.success", {
        defaultValue: "Seats updated to {{seats}}",
        seats: preview?.new_seats ?? "",
      }),
    );
    await queryClient.invalidateQueries({ queryKey: ["org-subscription"] });
    await queryClient.invalidateQueries({ queryKey: ["org-hotel-count"] });
    onOpenChange(false);
    await onConfirmed();
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("billing.seatUpgrade.title", "Add a seat to your subscription")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                {t(
                  "billing.seatUpgrade.intro",
                  "Each venue counts as one seat. Confirm to increase your subscription and proceed.",
                )}
              </p>

              {loading && (
                <div className="flex items-center gap-2 text-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("billing.seatUpgrade.loading", "Computing proration…")}
                </div>
              )}

              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 p-2 text-red-800">
                  {error}
                </p>
              )}

              {preview && !loading && !error && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-foreground">
                  <div className="flex justify-between">
                    <span>{t("billing.seatUpgrade.currentSeats", "Current seats")}</span>
                    <span className="font-medium">{preview.current_seats}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("billing.seatUpgrade.newSeats", "After upgrade")}</span>
                    <span className="font-medium">{preview.new_seats}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-border pt-2">
                    <span>{t("billing.seatUpgrade.chargedNow", "Charged today (prorated)")}</span>
                    <span className="font-semibold">
                      {formatMoney(
                        preview.proration.amount_due_cents,
                        preview.proration.currency,
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>
            {t("common.cancel", "Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={loading || confirming || !preview || Boolean(error)}
          >
            {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("billing.seatUpgrade.confirm", "Confirm upgrade")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
