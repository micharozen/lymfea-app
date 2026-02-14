import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PaymentLinkForm, BookingData } from "@/components/booking/PaymentLinkForm";
import { CheckCircle2 } from "lucide-react";

interface SuccessStepProps {
  booking: BookingData;
  bookingId: number;
  clientFirstName: string;
  clientLastName: string;
}

export function SuccessStep({
  booking,
  bookingId,
  clientFirstName,
  clientLastName,
}: SuccessStepProps) {
  const navigate = useNavigate();
  const { t } = useTranslation("pwa");

  useEffect(() => {
    navigator.vibrate?.([100, 50, 100]);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 animate-fade-in">
      <div className="flex flex-col items-center gap-2 mb-6">
        {/* Pulsing gold ring */}
        <div className="relative mb-2">
          <div className="absolute inset-0 bg-gold-400/20 rounded-full animate-ping" />
          <div className="relative bg-gold-400/10 rounded-full p-5 ring-1 ring-gold-400/30">
            <CheckCircle2 className="h-12 w-12 text-gold-400" strokeWidth={1.5} />
          </div>
        </div>

        <h3 className="text-[10px] uppercase tracking-[0.3em] text-gold-400 font-semibold">
          Confirmé
        </h3>
        <h2 className="font-serif text-xl text-foreground">
          {t("newBooking.bookingCreated", "Réservation créée !")}
        </h2>
        <p className="text-sm text-muted-foreground text-center">
          Réservation #{bookingId} pour {clientFirstName}{" "}
          {clientLastName}
        </p>
      </div>

      <PaymentLinkForm
        booking={booking}
        onSuccess={() => navigate("/pwa/dashboard")}
        onSkip={() => navigate("/pwa/dashboard")}
        showSkipButton
      />
    </div>
  );
}
