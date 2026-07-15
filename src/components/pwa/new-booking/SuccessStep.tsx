import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PaymentLinkForm, BookingData } from "@/components/booking/PaymentLinkForm";
import { formatPrice } from "@/lib/formatPrice";
import { Check } from "lucide-react";
import {
  isPartnerBilledClientType,
  type BookingClientType,
} from "@/lib/clientTypeMeta";

interface SuccessStepProps {
  booking: BookingData;
  bookingId: number;
  clientFirstName: string;
  clientLastName: string;
  isOffert?: boolean;
  clientType: BookingClientType;
}

export function SuccessStep({
  booking,
  bookingId,
  clientFirstName,
  clientLastName,
  isOffert = false,
  clientType,
}: SuccessStepProps) {
  const navigate = useNavigate();
  const { t } = useTranslation("pwa");

  // Lien de paiement uniquement pour un client "externe" (encaissement carte).
  // hotel = facturé en chambre, partenaires = facturés en fin de mois → pas de lien.
  const showPaymentLink = !isOffert && clientType === "external";
  const settlementNote = isOffert
    ? null
    : clientType === "hotel"
      ? t("newBooking.settlement.room", "Facturé en chambre")
      : isPartnerBilledClientType(clientType)
        ? t("newBooking.settlement.partner", "Facturé au partenaire")
        : null;

  useEffect(() => {
    navigator.vibrate?.([100, 50, 100]);
  }, []);

  const treatmentsLabel = booking.treatments?.map((tr) => tr.name).join(", ");
  const priceLabel = isOffert
    ? t("newBooking.offert.tag", "Offert")
    : formatPrice(booking.total_price ?? 0, booking.currency || "EUR");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="app-scroll flex-1" data-screen-label="Réservation créée">
        <div className="done-hero">
          <span className="ring">
            <Check size={26} />
          </span>
          <div className="t">{t("newBooking.bookingDone", "C'est réservé !")}</div>
          <div className="s">
            {t("newBooking.bookingNumber", "Réservation")} #{bookingId} · {clientFirstName} {clientLastName}
          </div>
          {(treatmentsLabel || priceLabel) && (
            <div className="s2">{[treatmentsLabel, priceLabel].filter(Boolean).join(" · ")}</div>
          )}
          {settlementNote && <div className="settle">{settlementNote}</div>}
        </div>

        {showPaymentLink && (
          <>
            <div className="sec-label">{t("newBooking.settlement.title", "Encaissement")}</div>
            <div style={{ padding: "0 16px 16px" }}>
              <PaymentLinkForm
                booking={booking}
                onSuccess={() => navigate("/pwa/dashboard")}
                onSkip={() => navigate("/pwa/dashboard")}
                showSkipButton
              />
            </div>
          </>
        )}

        <div style={{ height: 16 }} />
      </div>

      {!showPaymentLink && (
        <div className="fiche-foot">
          <button
            type="button"
            className="btn-primary-lg"
            onClick={() => navigate("/pwa/dashboard")}
          >
            {t("newBooking.done", "Terminé")}
          </button>
        </div>
      )}
    </div>
  );
}
