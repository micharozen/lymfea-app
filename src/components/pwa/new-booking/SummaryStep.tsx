import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/formatPrice";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2 } from "lucide-react";

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
  isPending: boolean;
  onCreate: () => void;
  onBack: () => void;
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
  isPending,
  onCreate,
  onBack,
}: SummaryStepProps) {
  const { t } = useTranslation("pwa");

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="border border-gold-400/20 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-5 pb-3 text-center">
            <h2 className="font-serif text-lg text-foreground">Votre réservation</h2>
          </div>

          {/* Lieu */}
          <div className="px-4 py-3 animate-fade-in" style={{ animationDelay: '0ms' }}>
            <p className="text-[10px] uppercase tracking-widest text-gold-600 dark:text-gold-400/70 mb-1">Lieu</p>
            <p className="text-sm font-medium">{hotelName}</p>
          </div>

          <div className="h-px bg-gold-400/15 mx-4" />

          {/* Client */}
          <div className="px-4 py-3 animate-fade-in" style={{ animationDelay: '100ms' }}>
            <p className="text-[10px] uppercase tracking-widest text-gold-600 dark:text-gold-400/70 mb-1">Client</p>
            <p className="text-sm font-medium">
              {clientFirstName} {clientLastName}
            </p>
            <p className="text-xs text-muted-foreground">
              {countryCode} {phone}
              {email && ` · ${email}`}
              {roomNumber && ` · Chambre ${roomNumber}`}
            </p>
          </div>

          <div className="h-px bg-gold-400/15 mx-4" />

          {/* Date/Time */}
          <div className="px-4 py-3 animate-fade-in" style={{ animationDelay: '200ms' }}>
            <p className="text-[10px] uppercase tracking-widest text-gold-600 dark:text-gold-400/70 mb-1">
              Date & heure
            </p>
            <p className="text-sm font-medium">
              {format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}{" "}
              à {selectedTime}
            </p>
          </div>

          <div className="h-px bg-gold-400/15 mx-4" />

          {/* Treatments */}
          <div className="px-4 py-3 animate-fade-in" style={{ animationDelay: '300ms' }}>
            <p className="text-[10px] uppercase tracking-widest text-gold-600 dark:text-gold-400/70 mb-2">
              Prestations
            </p>
            <div className="space-y-1.5">
              {cartDetails.map(({ treatmentId, quantity, treatment }) => (
                <div
                  key={treatmentId}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {treatment?.name}{" "}
                    {quantity > 1 && (
                      <span className="text-muted-foreground">
                        x{quantity}
                      </span>
                    )}
                  </span>
                  <span className="font-medium">
                    {formatPrice(
                      (treatment?.price || 0) * quantity,
                      currency
                    )}
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="bg-gold-400/10 rounded-lg p-3 mt-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-sm font-bold text-gold-400">
                {formatPrice(totalPrice, currency)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 italic">
              Durée estimée : {totalDuration} min
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gold-400/20 shrink-0 space-y-2">
        <Button
          className="w-full bg-gold-400 text-black hover:bg-gold-300 font-medium"
          onClick={onCreate}
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Création...
            </>
          ) : (
            t("newBooking.create", "Créer la réservation")
          )}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={onBack}
          disabled={isPending}
        >
          {t("newBooking.back", "Retour")}
        </Button>
      </div>
    </div>
  );
}
