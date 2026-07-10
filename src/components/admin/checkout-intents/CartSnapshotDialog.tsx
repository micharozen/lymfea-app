import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { parseCartSnapshot, type CheckoutIntentRow } from "@shared/db";
import { formatIntentPrice, formatIntentSlot } from "@/lib/admin/checkoutIntentFormat";

interface CartSnapshotDialogProps {
  intent: CheckoutIntentRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartSnapshotDialog({ intent, open, onOpenChange }: CartSnapshotDialogProps) {
  const { t } = useTranslation("admin");
  if (!intent) return null;

  const cart = parseCartSnapshot(intent.cart_snapshot);
  const slot = formatIntentSlot(intent.booking_date, intent.booking_time);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-normal text-base">
            {t("checkoutIntents.cartDialog.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("checkoutIntents.cartDialog.client")}>
              {intent.client_first_name} {intent.client_last_name ?? ""}
            </Field>
            <Field label={t("checkoutIntents.columns.email")}>{intent.client_email}</Field>
            <Field label={t("checkoutIntents.columns.venue")}>{intent.hotels?.name ?? "-"}</Field>
            <Field label={t("checkoutIntents.columns.slot")}>{slot}</Field>
            <Field label={t("checkoutIntents.cartDialog.language")}>
              <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                {intent.language.toUpperCase()}
              </Badge>
            </Field>
            {intent.room_number && (
              <Field label={t("checkoutIntents.cartDialog.roomNumber")}>{intent.room_number}</Field>
            )}
          </div>

          <div className="rounded-lg border border-border">
            {cart.items.length === 0 ? (
              <p className="p-4 text-muted-foreground">{t("checkoutIntents.cartDialog.emptyCart")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {cart.items.map((item, index) => (
                  <li key={`${item.treatmentId ?? "item"}-${index}`} className="flex items-center justify-between gap-4 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{item.name ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          item.variantLabel,
                          item.quantity && item.quantity > 1
                            ? t("checkoutIntents.cartDialog.quantity", { count: item.quantity })
                            : null,
                          item.guestCount && item.guestCount > 1
                            ? t("checkoutIntents.cartDialog.guests", { count: item.guestCount })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-foreground">
                      {item.isPriceOnRequest
                        ? t("checkoutIntents.cartDialog.onRequest")
                        : formatIntentPrice(item.price, cart.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {cart.total != null && (
              <div className="flex items-center justify-between border-t border-border p-3 font-medium">
                <span>{t("checkoutIntents.cartDialog.total")}</span>
                <span className="tabular-nums">{formatIntentPrice(cart.total, cart.currency)}</span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="truncate text-foreground">{children}</div>
    </div>
  );
}
