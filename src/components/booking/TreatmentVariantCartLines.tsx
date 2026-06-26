import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { formatPrice } from "@/lib/formatPrice";

export interface TreatmentVariant {
  id: string;
  label?: string | null;
  price?: number | null;
  duration?: number | null;
  guest_count?: number;
}

export interface TreatmentCartLineItem {
  id: string;
  name?: string;
  price?: number | null;
  duration?: number | null;
  price_on_request?: boolean | null;
  treatment_variants?: TreatmentVariant[];
}

export function getVariantLabel(v: TreatmentVariant): string {
  if (v.label) return v.label;
  if (v.guest_count === 1) return "Solo";
  if (v.guest_count === 2) return "Duo";
  return `×${v.guest_count ?? 1}`;
}

interface TreatmentVariantCartLinesProps {
  treatments: TreatmentCartLineItem[];
  currency: string;
  getCartQuantity: (treatmentId: string, variantId?: string | null) => number;
  addToCart: (treatmentId: string, variantId?: string | null) => void;
  incrementCart: (treatmentId: string, variantId?: string | null) => void;
  decrementCart: (treatmentId: string, variantId?: string | null) => void;
}

function PhoneQtyControls({
  qty,
  onAdd,
  onIncrement,
  onDecrement,
}: {
  qty: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  if (qty === 0) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={onAdd}>
        <Plus className="h-4 w-4" />
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={onDecrement}>
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-6 text-center text-sm font-medium">{qty}</span>
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={onIncrement}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

/** Phone booking modal: treatment list with per-variant cart controls. */
export function TreatmentVariantCartLines({
  treatments,
  currency,
  getCartQuantity,
  addToCart,
  incrementCart,
  decrementCart,
}: TreatmentVariantCartLinesProps) {
  return (
    <div className="space-y-2">
      {treatments.map((treatment) => {
        const variants = treatment.treatment_variants ?? [];
        const hasVariantChoice = variants.length >= 2;
        const totalQty = getCartQuantity(treatment.id);

        if (hasVariantChoice) {
          return (
            <div key={treatment.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-medium text-sm truncate flex-1">{treatment.name}</p>
                {totalQty > 0 && (
                  <span className="text-xs text-muted-foreground shrink-0">×{totalQty}</span>
                )}
              </div>
              {variants.map((v) => {
                const variantQty = getCartQuantity(treatment.id, v.id);
                const displayPrice = v.price ?? treatment.price;
                const displayDuration = v.duration ?? treatment.duration;
                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 pl-2 border-l-2 border-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{getVariantLabel(v)}</p>
                      <p className="text-xs text-muted-foreground">
                        {treatment.price_on_request
                          ? `${displayDuration || 0} min`
                          : `${formatPrice(displayPrice || 0, currency)} · ${displayDuration || 0} min`}
                      </p>
                    </div>
                    <PhoneQtyControls
                      qty={variantQty}
                      onAdd={() => addToCart(treatment.id, v.id)}
                      onIncrement={() => incrementCart(treatment.id, v.id)}
                      onDecrement={() => decrementCart(treatment.id, v.id)}
                    />
                  </div>
                );
              })}
            </div>
          );
        }

        const soleVariant = variants[0] ?? null;
        const variantId = soleVariant?.id;
        const qty = variantId != null
          ? getCartQuantity(treatment.id, variantId)
          : getCartQuantity(treatment.id);
        const displayPrice = soleVariant?.price ?? treatment.price;
        const displayDuration = soleVariant?.duration ?? treatment.duration;

        return (
          <div
            key={treatment.id}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{treatment.name}</p>
              <p className="text-xs text-muted-foreground">
                {treatment.price_on_request
                  ? `${displayDuration || 0} min`
                  : `${formatPrice(displayPrice || 0, currency)} · ${displayDuration || 0} min`}
              </p>
            </div>
            <PhoneQtyControls
              qty={qty}
              onAdd={() => addToCart(treatment.id, variantId ?? undefined)}
              onIncrement={() => incrementCart(treatment.id, variantId ?? undefined)}
              onDecrement={() => decrementCart(treatment.id, variantId ?? undefined)}
            />
          </div>
        );
      })}
    </div>
  );
}
