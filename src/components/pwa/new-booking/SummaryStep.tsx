import { useTranslation } from "react-i18next";
import { formatPrice } from "@/lib/formatPrice";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface SummaryStepProps {
  hotelName: string;
  clientFirstName: string;
  clientLastName: string;
  phone: string;
  countryCode: string;
  email: string;
  roomNumber: string;
  selectedDate: Date;
  selectedTime: string;
  cartDetails: Array<CartItem & { treatment: Treatment | undefined }>;
  totalPrice: number;
  totalDuration: number;
  currency: string;
  isOutOfHours: boolean;
  surchargeAmount: number;
  surchargePercent: number;
  isOffert: boolean;
  onIsOffertChange: (value: boolean) => void;
  isPending: boolean;
  onCreate: () => void;
}

export function SummaryStep({
  hotelName,
  clientFirstName,
  clientLastName,
  phone,
  countryCode,
  email,
  roomNumber,
  selectedDate,
  selectedTime,
  cartDetails,
  totalPrice,
  totalDuration,
  currency,
  isOutOfHours,
  surchargeAmount,
  surchargePercent,
  isOffert,
  onIsOffertChange,
  isPending,
  onCreate,
}: SummaryStepProps) {
  const { t } = useTranslation("pwa");

  const nbSoins = cartDetails.reduce((a, i) => a + i.quantity, 0);
  const grandTotal = totalPrice + surchargeAmount;

  const clientLine = [
    `${clientFirstName} ${clientLastName}`.trim(),
    [countryCode, phone].filter(Boolean).join(" "),
    email,
    roomNumber && `${t("newBooking.room", "Chambre")} ${roomNumber}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="app-scroll flex-1" data-screen-label="Étape récap">
        {/* En-tête fiche */}
        <div className="fiche-head" style={{ paddingTop: "calc(10px*var(--sp))" }}>
          <div className="venue">{hotelName}</div>
          <div className="addr">{clientLine}</div>
        </div>

        {/* Date / Heure / Durée */}
        <div className="fiche-when">
          <div className="cell">
            <div className="v">{format(selectedDate, "EEE d MMM", { locale: fr })}</div>
            <div className="l">Date</div>
          </div>
          <div className="cell">
            <div className="v">{selectedTime}</div>
            <div className="l">{t("newBooking.time", "Heure")}</div>
          </div>
          <div className="cell">
            <div className="v">{totalDuration} min</div>
            <div className="l">{t("newBooking.duration", "Durée")}</div>
          </div>
        </div>

        {/* Soins */}
        <div className="sec-label">
          {t("newBooking.treatments", "Soins")} <span className="count">{nbSoins}</span>
        </div>
        <div className="card">
          {cartDetails.map(({ treatmentId, quantity, treatment, priceOverride }) => (
            <div className="soin-row" key={treatmentId}>
              <span className="nm">
                {treatment?.name}
                {quantity > 1 ? ` × ${quantity}` : ""}
              </span>
              <span className="dur">{(treatment?.duration || 0) * quantity} min</span>
              <span className="pr">
                {formatPrice((priceOverride ?? treatment?.price ?? 0) * quantity, currency)}
              </span>
            </div>
          ))}

          {/* Majoration hors horaires (préservée) */}
          {!isOffert && isOutOfHours && surchargeAmount > 0 && (
            <div className="soin-row">
              <span className="nm" style={{ color: "var(--clay)" }}>
                {t("newBooking.outOfHoursSurcharge", "Majoration hors horaires")} ({surchargePercent}%)
              </span>
              <span className="pr" style={{ color: "var(--clay)" }}>
                +{formatPrice(surchargeAmount, currency)}
              </span>
            </div>
          )}

          {/* Total */}
          <div className="soin-row" style={{ background: "var(--sand-100)" }}>
            <span className="nm" style={{ fontWeight: 600 }}>
              {t("newBooking.totalClient", "Total client")}
            </span>
            {isOffert ? (
              <>
                <span className="pr" style={{ textDecoration: "line-through", opacity: 0.45 }}>
                  {formatPrice(grandTotal, currency)}
                </span>
                <span className="pr" style={{ fontWeight: 600 }}>
                  {formatPrice(0, currency)}
                </span>
              </>
            ) : (
              <span className="pr" style={{ fontWeight: 600 }}>
                {formatPrice(grandTotal, currency)}
              </span>
            )}
          </div>
        </div>

        {/* Soin offert */}
        <button
          type="button"
          className="quiet-row"
          onClick={() => onIsOffertChange(!isOffert)}
        >
          <span className={cn("chk", isOffert && "on")}>{isOffert && <Check size={13} />}</span>
          {t("newBooking.offert.label", "Soin offert (gratuit)")}
        </button>

        <div style={{ height: 16 }} />
      </div>

      {/* Footer */}
      <div className="fiche-foot">
        <button type="button" className="btn-primary-lg" onClick={onCreate} disabled={isPending}>
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("newBooking.creating", "Création…")}
            </span>
          ) : (
            t("newBooking.create", "Créer la réservation")
          )}
        </button>
      </div>
    </div>
  );
}
