import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Hotel } from "@/hooks/booking";

interface CalendarLegendProps {
  hotels?: Hotel[];
  hotelFilter?: string;
  className?: string;
}

interface StatusEntry {
  key: string;
  label: string;
  swatchClass: string;
}

function useStatusEntries(): StatusEntry[] {
  const { i18n } = useTranslation();
  const fr = i18n.language?.startsWith("fr");
  return [
    {
      key: "pending",
      label: fr ? "Pré-réservation" : "Pre-booking",
      swatchClass: "bg-orange-500",
    },
    {
      key: "confirmed",
      label: fr ? "Confirmé" : "Confirmed",
      swatchClass: "bg-emerald-500",
    },
    {
      key: "payment_pending",
      label: fr ? "Paiement en attente" : "Payment pending",
      swatchClass: "bg-blue-500",
    },
    {
      key: "cancelled",
      label: fr ? "Annulé" : "Cancelled",
      swatchClass: "bg-cancelled-stripes border border-gray-300",
    },
    {
      key: "completed",
      label: fr ? "Terminé" : "Completed",
      swatchClass: "bg-emerald-300",
    },
    {
      key: "quote_pending",
      label: fr ? "Devis / Proposé" : "Quote / Proposed",
      swatchClass: "bg-violet-500",
    },
  ];
}

export function CalendarLegend({ hotels, hotelFilter, className }: CalendarLegendProps) {
  const { i18n } = useTranslation();
  const fr = i18n.language?.startsWith("fr");
  const statusEntries = useStatusEntries();

  const visibleHotels =
    hotelFilter && hotelFilter !== "all"
      ? hotels?.filter((h) => h.id === hotelFilter) ?? []
      : hotels ?? [];

  return (
    <div className={cn("flex flex-col gap-3 px-3 py-3 text-xs", className)}>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          {fr ? "Statuts" : "Statuses"}
        </div>
        <ul className="space-y-1">
          {statusEntries.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-3 w-3 rounded-sm flex-shrink-0",
                  s.swatchClass
                )}
              />
              <span className="truncate">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {visibleHotels.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {fr ? "Lieux" : "Venues"}
          </div>
          <ul className="space-y-1">
            {visibleHotels.map((hotel) => (
              <li key={hotel.id} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-1 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: hotel.calendar_color || "#3b82f6" }}
                />
                <span className="truncate">{hotel.name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-muted-foreground italic">
            {fr ? "Barre verticale sur la carte" : "Vertical bar on card"}
          </p>
        </div>
      )}
    </div>
  );
}
