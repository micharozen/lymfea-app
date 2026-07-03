import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, History } from "lucide-react";
import { useVenueHistory, type VenueAuditEntry } from "@/hooks/venue/useVenueHistory";

const FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  status: "Statut",
  venue_type: "Type",
  address: "Adresse",
  city: "Ville",
  country: "Pays",
  country_code: "Code pays",
  postal_code: "Code postal",
  timezone: "Fuseau horaire",
  opening_time: "Ouverture",
  closing_time: "Fermeture",
  currency: "Devise",
  vat: "TVA",
  therapist_commission: "Commission thérapeute",
  venue_commission: "Commission lieu",
  auto_validate_bookings: "Validation auto",
  slot_interval: "Intervalle créneaux",
  client_payment_mode: "Mode de paiement client",
  description: "Description",
  description_en: "Description (EN)",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  draft: "Brouillon",
};

const VENUE_TYPE_LABELS: Record<string, string> = {
  hotel: "Hôtel",
  spa: "Spa",
};

const CLIENT_PAYMENT_MODE_LABELS: Record<string, string> = {
  pre_authorization: "Pré-autorisation",
  pay_at_booking: "Paiement à la réservation",
};

/** Turn an unlabeled column key into a readable label (e.g. "cover_image" → "Cover image"). */
function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  if (field === "status") return STATUS_LABELS[value as string] ?? String(value);
  if (field === "venue_type") return VENUE_TYPE_LABELS[value as string] ?? String(value);
  if (field === "client_payment_mode") return CLIENT_PAYMENT_MODE_LABELS[value as string] ?? String(value);
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (field === "vat" || field === "therapist_commission" || field === "venue_commission") {
    return `${value} %`;
  }
  if (typeof value === "object") return JSON.stringify(value);

  return String(value);
}

function getChangedFields(entry: VenueAuditEntry) {
  const oldVals = entry.old_values ?? {};
  const newVals = entry.new_values ?? {};

  const allKeys = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);

  return Array.from(allKeys).map((key) => ({
    field: key,
    label: FIELD_LABELS[key] ?? humanizeKey(key),
    oldValue: formatValue(key, oldVals[key]),
    newValue: formatValue(key, newVals[key]),
  }));
}

interface VenueHistoryTabProps {
  hotelId: string;
  enabled: boolean;
}

export function VenueHistoryTab({ hotelId, enabled }: VenueHistoryTabProps) {
  const { data: entries, isLoading } = useVenueHistory(hotelId, enabled);

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
        <p className="text-sm">Aucun changement enregistré pour ce lieu.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="relative border-l-2 border-gray-200 ml-4 space-y-6">
        {entries.map((entry) => {
          const fields = getChangedFields(entry);
          const dateObj = new Date(entry.changed_at);
          const isInsert = entry.change_type === "insert";

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
                    Le {format(dateObj, "dd/MM/yyyy à HH:mm:ss")}
                  </span>
                  {entry.changed_by_name && (
                    <span className="text-xs font-medium text-gray-500">
                      par {entry.changed_by_name}
                    </span>
                  )}
                </div>

                {isInsert ? (
                  <p className="text-sm text-green-600 font-medium">Lieu créé</p>
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
