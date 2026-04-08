import { Button } from "@/components/ui/button";
import { Send, CheckCircle2 } from "lucide-react";
import { formatPrice } from "@/lib/formatPrice";

interface BookingPaymentStepProps {
  createdBooking: {
    id: string;
    booking_id: number;
    hotel_name: string;
  };
  isAdmin: boolean;
  clientFirstName: string;
  clientLastName: string;
  finalPrice: number;
  currency: string;
  onSendPaymentLink: () => void;
  onClose: () => void;
}

export function BookingPaymentStep({
  createdBooking,
  isAdmin,
  clientFirstName,
  clientLastName,
  finalPrice,
  currency,
  onSendPaymentLink,
  onClose,
}: BookingPaymentStepProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 py-6">
      <div className="flex flex-col items-center gap-3">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <h3 className="text-lg font-semibold">
          {isAdmin ? "Réservation créée" : "Demande envoyée"}
        </h3>
        <p className="text-sm text-muted-foreground text-center">
          Réservation #{createdBooking.booking_id} pour {clientFirstName} {clientLastName}
        </p>
        <p className="text-sm font-medium">{formatPrice(finalPrice, currency)}</p>
        {!isAdmin && (
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Les thérapeutes du lieu ont été notifiés. Le lien de paiement sera envoyé automatiquement au client une fois qu'un thérapeute aura validé un créneau.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        {isAdmin && (
          <Button
            type="button"
            onClick={onSendPaymentLink}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            <Send className="h-4 w-4 mr-2" />
            Envoyer lien de paiement
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
        >
          Fermer
        </Button>
      </div>
    </div>
  );
}
