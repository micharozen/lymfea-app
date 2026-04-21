import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, History } from "lucide-react";
import { useBookingHistory, type BookingAuditEntry } from "@/hooks/booking/useBookingHistory";

const FIELD_LABELS: Record<string, string> = {
  status: "Statut",
  payment_status: "Paiement",
  therapist_id: "Thérapeute",
  therapist_name: "Thérapeute",
  booking_date: "Date",
  booking_time: "Horaire",
  duration: "Durée",
  total_price: "Prix total",
  payment_method: "Méthode de paiement",
  room_id: "Salle",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  completed: "Terminé",
  cancelled: "Annulé",
  no_show: "No-show",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  paid: "Payé",
  failed: "Échoué",
  refunded: "Remboursé",
  charged_to_room: "Facturé chambre",
};

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  if (field === "status") return STATUS_LABELS[value as string] ?? String(value);
  if (field === "payment_status") return PAYMENT_STATUS_LABELS[value as string] ?? String(value);
  if (field === "total_price") return `${Number(value).toFixed(2)} €`;
  if (field === "duration") return `${value} min`;
  if (field === "booking_time" && typeof value === "string") return value.substring(0, 5);

  return String(value);
}

function getChangedFields(entry: BookingAuditEntry) {
  const oldVals = entry.old_values ?? {};
  const newVals = entry.new_values ?? {};

  // Deduplicate: if therapist_id changed, skip therapist_name separately
  const allKeys = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);
  if (allKeys.has("therapist_id")) allKeys.delete("therapist_name");

  return Array.from(allKeys)
    .filter((key) => key in FIELD_LABELS)
    .map((key) => {
      const displayKey = key === "therapist_id" ? "therapist_name" : key;
      return {
        field: key,
        label: FIELD_LABELS[key],
        oldValue: formatValue(displayKey, oldVals[displayKey] ?? oldVals[key]),
        newValue: formatValue(displayKey, newVals[displayKey] ?? newVals[key]),
      };
    });
}

function isInsert(entry: BookingAuditEntry) {
  return entry.change_type === "insert";
}

interface BookingHistoryTabProps {
  bookingId: string;
  enabled: boolean;
}

export function BookingHistoryTab({ bookingId, enabled }: BookingHistoryTabProps) {
  const { data: entries, isLoading } = useBookingHistory(bookingId, enabled);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <History className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Aucun changement enregistré pour cette réservation.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="relative border-l-2 border-gray-200 ml-4 space-y-6">
        {entries.map((entry) => {
          const fields = getChangedFields(entry);
          const dateObj = new Date(entry.changed_at);

          return (
            <div key={entry.id} className="relative pl-8">
              {/* Timeline dot */}
              <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-white" />

              <div className="bg-white rounded-lg border p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-xs text-muted-foreground"
                    title={format(dateObj, "d MMMM yyyy à HH:mm:ss", { locale: fr })}
                  >
                    {formatDistanceToNow(dateObj, { addSuffix: true, locale: fr })}
                  </span>
                  {entry.changed_by_name && (
                    <span className="text-xs font-medium text-gray-500">
                      par {entry.changed_by_name}
                    </span>
                  )}
                </div>

                {isInsert(entry) ? (
                  <p className="text-sm text-green-600 font-medium">Réservation créée</p>
                ) : (
                  <div className="space-y-2">
                    {fields.map(({ field, label, oldValue, newValue }) => (
                      <div key={field} className="text-sm">
                        <span className="font-medium text-gray-700">{label}</span>
                        <span className="mx-2 text-gray-400">:</span>
                        <span className="text-red-500/80 line-through">{oldValue}</span>
                        <span className="mx-1.5 text-gray-400">→</span>
                        <span className="text-green-600 font-medium">{newValue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
