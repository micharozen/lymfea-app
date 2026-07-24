import { Button } from "@/components/ui/button";
import { Send, CheckCircle2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatPrice } from "@/lib/formatPrice";

interface BookingPaymentStepProps {
  createdBooking: {
    id: string;
    booking_id: number;
    hotel_name: string;
    /** Réservations liées quand un combo-duo multi-horaire a créé un groupe. */
    groupBookings?: Array<{ id: string; booking_id?: number }>;
  };
  isAdmin: boolean;
  isConcierge?: boolean;
  clientFirstName: string;
  clientLastName: string;
  finalPrice: number;
  currency: string;
  clientType: string;
  onSendPaymentLink: () => void;
  onClose: () => void;
}

export function BookingPaymentStep({
  createdBooking,
  isAdmin,
  isConcierge = false,
  clientFirstName,
  clientLastName,
  finalPrice,
  currency,
  clientType,
  onSendPaymentLink,
  onClose,
}: BookingPaymentStepProps) {
  const navigate = useNavigate();
  // Concierges get the same booking-created recap + payment-link action as admins.
  const canSendPaymentLink = isAdmin || isConcierge;
  const group = createdBooking.groupBookings ?? [];
  const isGroup = group.length > 1;
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 py-6">
      <div className="flex flex-col items-center gap-3">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <h3 className="text-lg font-semibold">
          {isGroup
            ? (canSendPaymentLink ? "Réservations créées" : "Demandes envoyées")
            : (canSendPaymentLink ? "Réservation créée" : "Demande envoyée")}
        </h3>
        <p className="text-sm text-muted-foreground text-center">
          {isGroup
            ? `${group.length} réservations pour ${clientFirstName} ${clientLastName}`
            : `Réservation #${createdBooking.booking_id} pour ${clientFirstName} ${clientLastName}`}
        </p>
        <p className="text-sm font-medium">{formatPrice(finalPrice, currency)}</p>
        {!canSendPaymentLink && (
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Les thérapeutes du lieu ont été notifiés. Le lien de paiement sera envoyé automatiquement au client une fois qu'un thérapeute aura validé un créneau.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        {canSendPaymentLink && clientType === "external" && (
          <Button
            type="button"
            onClick={onSendPaymentLink}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            <Send className="h-4 w-4 mr-2" />
            Envoyer lien de paiement
          </Button>
        )}
        {isGroup ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground text-center">Voir les réservations</p>
            <div className="grid grid-cols-2 gap-2">
              {group.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/admin/bookings/${b.id}`);
                  }}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:border-primary hover:bg-muted/50 transition-colors"
                >
                  <span>Réservation #{b.booking_id}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Button
            type="button"
            onClick={() => {
              onClose();
              navigate(`/admin/bookings/${createdBooking.id}`);
            }}
          >
            Voir la réservation
            <ArrowRight className="h-4 w-4 ml-2" />
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
