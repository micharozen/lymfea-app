import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPrice } from "@/lib/formatPrice";
import { Plus, Minus, Pencil } from "lucide-react";

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
  priceOverride?: number | null;
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
  setLineOverride: (id: string, value: number | null) => void;
  onNext: () => void;
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
  setLineOverride,
  onNext,
}: TreatmentStepProps) {
  const { t } = useTranslation("pwa");
  const [showPriceOverrides, setShowPriceOverrides] = useState(false);

  const overriddenCount = cartDetails.filter((c) => c.priceOverride != null).length;
  const nbSoins = cart.reduce((a, i) => a + i.quantity, 0);

  const groupedTreatments: Record<string, Treatment[]> = {};
  treatments.forEach((tr) => {
    const c = tr.category || "Autres";
    if (!groupedTreatments[c]) groupedTreatments[c] = [];
    groupedTreatments[c].push(tr);
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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="app-scroll flex-1" data-screen-label="Étape prestations">
        {treatmentsLoading ? (
          <div className="placeholder" style={{ minHeight: 200 }}>
            <p>{t("newBooking.loadingTreatments", "Chargement…")}</p>
          </div>
        ) : !treatments.length ? (
          <div className="placeholder" style={{ minHeight: 200 }}>
            <p>{t("newBooking.noTreatment", "Aucune prestation disponible")}</p>
          </div>
        ) : (
          Object.entries(groupedTreatments).map(([category, items]) => (
            <div key={category}>
              <div className="sec-label">{category}</div>
              <div className="card" style={{ marginBottom: 4 }}>
                {items.map((treatment) => {
                  const qty = getCartQuantity(treatment.id);
                  return (
                    <div className="presta-row" key={treatment.id}>
                      <div className="ptx">
                        <div className="nm">
                          {treatment.name}
                          {treatment.price_on_request && (
                            <span className="status due" style={{ padding: "2px 8px", fontSize: 10 }}>
                              {t("newBooking.onRequest", "Sur demande")}
                            </span>
                          )}
                        </div>
                        <div className="mt">
                          {treatment.price_on_request
                            ? `${treatment.duration} min`
                            : `${formatPrice(treatment.price, currency, { decimals: 0 })} · ${treatment.duration} min`}
                        </div>
                      </div>
                      {qty === 0 ? (
                        <button
                          type="button"
                          className="p-add"
                          onClick={() => handleAdd(treatment.id)}
                          aria-label={t("newBooking.add", "Ajouter")}
                        >
                          <Plus size={15} />
                        </button>
                      ) : (
                        <div className="p-qty">
                          <button type="button" onClick={() => decrementCart(treatment.id)} aria-label="−">
                            <Minus size={15} />
                          </button>
                          <span>{qty}</span>
                          <button type="button" onClick={() => handleIncrement(treatment.id)} aria-label="+">
                            <Plus size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Édition des prix par prestation (fonctionnalité conservée) */}
        {cartDetails.length > 0 && (
          <div className="price-override">
            <button type="button" className="po-toggle" onClick={() => setShowPriceOverrides((v) => !v)}>
              <Pencil size={12} />
              <span>{t("newBooking.priceOverride.label", "Prix par prestation")}</span>
              {overriddenCount > 0 && (
                <span className="badge">{t("newBooking.priceOverride.count", { count: overriddenCount })}</span>
              )}
            </button>
            {showPriceOverrides && (
              <div>
                {cartDetails.map(({ treatmentId, treatment, priceOverride }) => (
                  <div className="po-line" key={`ov-${treatmentId}`}>
                    <span className="nm">{treatment?.name}</span>
                    {priceOverride != null && (
                      <span className="badge">{t("newBooking.priceOverride.modified", "modifié")}</span>
                    )}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceOverride ?? ""}
                      onChange={(e) =>
                        setLineOverride(treatmentId, e.target.value === "" ? null : Number(e.target.value))
                      }
                      placeholder={String(treatment?.price ?? 0)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ height: 12 }} />
      </div>

      {/* Footer */}
      <div className="fiche-foot">
        <button
          type="button"
          className="btn-primary-lg"
          disabled={nbSoins === 0}
          style={{ opacity: nbSoins === 0 ? 0.4 : 1 }}
          onClick={onNext}
        >
          {nbSoins > 0
            ? `${t("newBooking.continue", "Continuer")} · ${nbSoins} ${
                nbSoins > 1
                  ? t("newBooking.treatmentsCountPlural", "soins")
                  : t("newBooking.treatmentsCount", "soin")
              } · ${formatPrice(totalPrice, currency)}`
            : t("newBooking.continue", "Continuer")}
        </button>
      </div>
    </div>
  );
}
