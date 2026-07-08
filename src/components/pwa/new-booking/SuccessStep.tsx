import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PaymentLinkForm, BookingData } from "@/components/booking/PaymentLinkForm";
import { CheckCircle2 } from "lucide-react";
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

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 animate-fade-in">
      <div className="flex flex-col items-center gap-2 mb-6">
        {/* Pulsing primary ring */}
        <div className="relative mb-2">
          <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
          <div className="relative bg-primary/10 rounded-full p-5 ring-1 ring-primary/30">
            <CheckCircle2 className="h-12 w-12 text-primary" strokeWidth={1.5} />
          </div>
        </div>

        <h3 className="text-[10px] uppercase tracking-[0.3em] text-primary font-semibold">
          Confirmé
        </h3>
        <h2 className="font-serif text-xl text-foreground">
          {t("newBooking.bookingCreated", "Réservation créée !")}
        </h2>
        <p className="text-sm text-muted-foreground text-center">
          Réservation #{bookingId} pour {clientFirstName}{" "}
          {clientLastName}
        </p>
        {settlementNote && (
          <span className="text-[11px] font-medium text-primary bg-primary/10 rounded-full px-2.5 py-0.5">
            {settlementNote}
          </span>
        )}
      </div>

      {showPaymentLink ? (
        <PaymentLinkForm
          booking={booking}
          onSuccess={() => navigate("/pwa/dashboard")}
          onSkip={() => navigate("/pwa/dashboard")}
          showSkipButton
        />
      ) : (
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          onClick={() => navigate("/pwa/dashboard")}
        >
          {t("newBooking.backToDashboard", "Retour au tableau de bord")}
        </Button>
      )}
    </div>
  );
}
