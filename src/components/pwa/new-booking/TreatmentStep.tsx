import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { Plus, Minus } from "lucide-react";

interface Treatment {
  id: string;
  name: string;
  description?: string;
  duration: number;
  price: number;
  price_on_request?: boolean;
  service_for?: string;
  category?: string;
  currency?: string;
}

interface CartItem {
  treatmentId: string;
  quantity: number;
}

interface TreatmentStepProps {
  treatments: Treatment[];
  treatmentsLoading: boolean;
  cart: CartItem[];
  cartDetails: Array<CartItem & { treatment: Treatment | undefined }>;
  currency: string;
  totalPrice: number;
  addToCart: (id: string) => void;
  incrementCart: (id: string) => void;
  decrementCart: (id: string) => void;
  getCartQuantity: (id: string) => number;
  onNext: () => void;
  onBack: () => void;
}

export function TreatmentStep({
  treatments,
  treatmentsLoading,
  cart,
  cartDetails,
  currency,
  totalPrice,
  addToCart,
  incrementCart,
  decrementCart,
  getCartQuantity,
  onNext,
  onBack,
}: TreatmentStepProps) {
  const { t } = useTranslation("pwa");
  const [treatmentFilter, setTreatmentFilter] = useState<"female" | "male">("female");

  const filteredTreatments = treatments.filter((t) =>
    treatmentFilter === "female"
      ? t.service_for === "Female" || t.service_for === "All"
      : t.service_for === "Male" || t.service_for === "All"
  );

  const groupedTreatments: Record<string, Treatment[]> = {};
  filteredTreatments.forEach((t) => {
    const c = t.category || "Autres";
    if (!groupedTreatments[c]) groupedTreatments[c] = [];
    groupedTreatments[c].push(t);
  });

  const handleAdd = (treatmentId: string) => {
    navigator.vibrate?.(50);
    addToCart(treatmentId);
  };

  const handleIncrement = (treatmentId: string) => {
    navigator.vibrate?.(50);
    incrementCart(treatmentId);
  };

  return (
    <div className="flex-1 flex flex-col px-4 py-4">
      {/* Gender Tabs */}
      <div className="flex items-center gap-4 border-b border-gold-400/20 shrink-0 mb-3">
        {(["female", "male"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setTreatmentFilter(f)}
            className={cn(
              "pb-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors",
              treatmentFilter === f
                ? "text-gold-400 border-b-2 border-gold-400"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "female" ? "WOMEN'S MENU" : "MEN'S MENU"}
          </button>
        ))}
      </div>

      {/* Treatment list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {treatmentsLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Chargement...
          </div>
        ) : !filteredTreatments.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Aucune prestation disponible
          </div>
        ) : (
          Object.entries(groupedTreatments).map(([category, items]) => (
            <div key={category} className="mb-3">
              <h3 className="text-[9px] font-serif font-bold text-gold-600 dark:text-gold-400 uppercase tracking-widest mb-1.5 pb-0.5 border-b border-gold-400/20 flex items-center gap-2">
                <span className="w-0.5 h-3 bg-gold-400 rounded-full" />
                {category}
              </h3>
              <div>
                {items.map((treatment) => {
                  const qty = getCartQuantity(treatment.id);
                  return (
                    <div
                      key={treatment.id}
                      className="flex items-center justify-between py-1.5 border-b border-border/10 last:border-0 active:scale-[0.98] transition-transform"
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
                            : `${formatPrice(treatment.price, currency, { decimals: 0 })} · ${treatment.duration} min`}
                        </span>
                      </div>

                      {qty > 0 ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => decrementCart(treatment.id)}
                            className="w-5 h-5 rounded-full border border-gold-400/30 flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Minus className="h-2.5 w-2.5" />
                          </button>
                          <span className="text-xs font-bold w-4 text-center text-gold-400">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleIncrement(treatment.id)}
                            className="w-5 h-5 rounded-full border border-gold-400/30 flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Plus className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAdd(treatment.id)}
                          className="shrink-0 bg-gold-400 text-black text-[9px] font-medium uppercase tracking-wide h-5 px-2.5 rounded-full hover:bg-gold-300 transition-all active:scale-95"
                        >
                          Ajouter
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cart Footer */}
      <div className="shrink-0 border-t border-gold-400/20 pt-3 mt-3">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-8 text-xs px-3 shrink-0"
          >
            {t("newBooking.back", "Retour")}
          </Button>

          <div className="flex-1 min-w-0 flex justify-center">
            {cart.length > 0 ? (
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {cartDetails.slice(0, 2).map(({ treatmentId, quantity, treatment }) => (
                  <div
                    key={treatmentId}
                    className="flex items-center gap-1 bg-gold-50 dark:bg-gold-900/30 text-gold-800 dark:text-gold-200 rounded-full px-2 py-0.5 shrink-0"
                  >
                    <span className="text-[9px] font-medium truncate max-w-[60px]">
                      {treatment?.name}
                    </span>
                    <span className="text-[9px] font-bold">x{quantity}</span>
                  </div>
                ))}
                {cartDetails.length > 2 && (
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    +{cartDetails.length - 2}
                  </span>
                )}
                <span className="font-bold text-sm shrink-0 ml-1 text-gold-400">
                  {formatPrice(totalPrice, currency)}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground">
                Aucun service
              </span>
            )}
          </div>

          <Button
            size="sm"
            onClick={onNext}
            className="h-8 text-xs px-3 shrink-0 bg-gold-400 text-black hover:bg-gold-300"
          >
            {t("newBooking.next", "Suivant")}
          </Button>
        </div>
      </div>
    </div>
  );
}
