import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Minus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { CartItem } from "../CreateBookingDialog.schema";

interface Treatment {
  id: string;
  name?: string;
  price?: number | null;
  duration?: number | null;
  price_on_request?: boolean | null;
  service_for?: string | null;
  category?: string | null;
  [key: string]: unknown;
}

interface BookingPrestationsStepProps {
  treatments: Treatment[] | undefined;
  selectedHotel: { currency?: string | null } | undefined;
  isAdmin: boolean;
  cart: CartItem[];
  cartDetails: Array<CartItem & { treatment: Treatment | undefined }>;
  addToCart: (id: string) => void;
  incrementCart: (id: string) => void;
  decrementCart: (id: string) => void;
  getCartQuantity: (treatmentId: string) => number;
  totalPrice: number;
  totalDuration: number;
  hasOnRequestService: boolean;
  finalPrice: number;
  customPrice: string;
  setCustomPrice: (v: string) => void;
  customDuration: string;
  setCustomDuration: (v: string) => void;
  isPending: boolean;
  onBack: () => void;
}

export function BookingPrestationsStep({
  treatments,
  selectedHotel,
  isAdmin,
  cart,
  cartDetails,
  addToCart,
  incrementCart,
  decrementCart,
  getCartQuantity,
  totalPrice,
  totalDuration,
  hasOnRequestService,
  finalPrice,
  customPrice,
  setCustomPrice,
  customDuration,
  setCustomDuration,
  isPending,
  onBack,
}: BookingPrestationsStepProps) {
  const [treatmentFilter, setTreatmentFilter] = useState<"female" | "male">("female");

  return (
    <>
      {/* Menu Tabs */}
      <div className="flex items-center gap-4 border-b border-border/50 shrink-0 mb-3">
        {(["female", "male"] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setTreatmentFilter(f)}
            className={cn(
              "pb-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors",
              treatmentFilter === f
                ? "text-foreground border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "female" ? "WOMEN'S MENU" : "MEN'S MENU"}
          </button>
        ))}
      </div>

      {/* SERVICE LIST - Scrollable with max height */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {(() => {
          const filtered = treatments?.filter(t =>
            treatmentFilter === "female"
              ? (t.service_for === "Female" || t.service_for === "All")
              : (t.service_for === "Male" || t.service_for === "All")
          ) || [];

          const grouped: Record<string, typeof filtered> = {};
          filtered.forEach(t => {
            const c = t.category || "Autres";
            if (!grouped[c]) grouped[c] = [];
            grouped[c].push(t);
          });

          if (!filtered.length) {
            return (
              <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">
                Aucune prestation disponible
              </div>
            );
          }

          return Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-2">
              <h3 className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 pb-0.5 border-b border-border/30">
                {category}
              </h3>

              <div>
                {items.map((treatment) => {
                  const qty = getCartQuantity(treatment.id);
                  return (
                    <div
                      key={treatment.id}
                      className="flex items-center justify-between py-1.5 border-b border-border/10 last:border-0"
                    >
                      <div className="flex flex-col flex-1 pr-2 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground text-xs truncate">
                            {treatment.name}
                          </span>
                          {treatment.price_on_request && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                              Sur demande
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {treatment.price_on_request
                            ? `${treatment.duration} min`
                            : `${formatPrice(treatment.price, selectedHotel?.currency || 'EUR', { decimals: 0 })} • ${treatment.duration} min`}
                        </span>
                      </div>

                      {qty > 0 ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => decrementCart(treatment.id)}
                            className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Minus className="h-2.5 w-2.5" />
                          </button>
                          <span className="text-xs font-bold w-4 text-center">{qty}</span>
                          <button
                            type="button"
                            onClick={() => incrementCart(treatment.id)}
                            className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Plus className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(treatment.id)}
                          className="shrink-0 bg-foreground text-background text-[9px] font-medium uppercase tracking-wide h-5 px-2.5 rounded-full hover:bg-foreground/80 transition-colors"
                        >
                          Ajouter
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Compact Footer */}
      <div className="shrink-0 border-t border-border bg-background pt-3 mt-3 space-y-3">
        {/* Admin-only: Custom Price & Duration - ONLY for On Request services */}
        {isAdmin && hasOnRequestService && (
          <div className="grid grid-cols-2 gap-2 pb-2 border-b border-border/50">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Prix personnalisé (€)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="h-7 text-xs"
                placeholder={String(totalPrice)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Durée personnalisée (min)</Label>
              <Input
                type="number"
                min="0"
                step="5"
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                className="h-7 text-xs"
                placeholder={String(totalDuration)}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {/* Cart Summary */}
          <div className="flex-1 min-w-0">
            {cart.length > 0 ? (
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {cartDetails.slice(0, 3).map(({ treatmentId, quantity, treatment }) => (
                  <div key={treatmentId} className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 shrink-0">
                    <span className="text-[9px] font-medium truncate max-w-[60px]">{treatment!.name}</span>
                    <span className="text-[9px] font-bold">×{quantity}</span>
                  </div>
                ))}
                {cartDetails.length > 3 && (
                  <span className="text-[9px] text-muted-foreground shrink-0">+{cartDetails.length - 3}</span>
                )}
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground">Aucun service</span>
            )}
          </div>

          {/* Total + Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-bold text-sm">{formatPrice(finalPrice, selectedHotel?.currency || 'EUR')}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBack}
              className="h-7 text-xs px-2"
            >
              ← Retour
            </Button>
            <Button
              type="submit"
              disabled={isPending || cart.length === 0}
              size="sm"
              className="bg-foreground text-background hover:bg-foreground/90 h-7 text-xs px-3"
            >
              {isPending ? "Création..." : isAdmin ? "Créer" : "Demander un devis"}
              {isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
