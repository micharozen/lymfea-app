import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Loader2, History } from "lucide-react";
import { useDateLocale } from "@/lib/dateLocale";
import { useVenueHistory, type VenueAuditEntry } from "@/hooks/venue/useVenueHistory";

/** Columns with a curated label under `venueHistory.fields.*`. */
const LABELLED_FIELDS = new Set([
  "name",
  "status",
  "venue_type",
  "address",
  "city",
  "country",
  "country_code",
  "postal_code",
  "timezone",
  "opening_time",
  "closing_time",
  "currency",
  "vat",
  "therapist_commission",
  "venue_commission",
  "auto_validate_bookings",
  "slot_interval",
  "client_payment_mode",
  "description",
  "description_en",
]);

/** Turn an unlabeled column key into a readable label (e.g. "cover_image" → "Cover image"). */
function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(t: TFunction, field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  if (field === "status") {
    return t(`venueHistory.status.${value as string}`, { defaultValue: String(value) });
  }
  if (field === "venue_type") {
    return t(`venueHistory.venueType.${value as string}`, { defaultValue: String(value) });
  }
  if (field === "client_payment_mode") {
    return t(`venueHistory.clientPaymentMode.${value as string}`, { defaultValue: String(value) });
  }
  if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
  if (field === "vat" || field === "therapist_commission" || field === "venue_commission") {
    return `${value} %`;
  }
  if (typeof value === "object") return JSON.stringify(value);

  return String(value);
}

function getChangedFields(t: TFunction, entry: VenueAuditEntry) {
  const oldVals = entry.old_values ?? {};
  const newVals = entry.new_values ?? {};

  const allKeys = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);

  return Array.from(allKeys).map((key) => ({
    field: key,
    label: LABELLED_FIELDS.has(key) ? t(`venueHistory.fields.${key}`) : humanizeKey(key),
    oldValue: formatValue(t, key, oldVals[key]),
    newValue: formatValue(t, key, newVals[key]),
  }));
}

interface VenueHistoryTabProps {
  hotelId: string;
  enabled: boolean;
}

export function VenueHistoryTab({ hotelId, enabled }: VenueHistoryTabProps) {
  const { t } = useTranslation(["admin", "common"]);
  const dateLocale = useDateLocale();
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
        <p className="text-sm">{t("venueHistory.empty")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="relative border-l-2 border-gray-200 ml-4 space-y-6">
        {entries.map((entry) => {
          const fields = getChangedFields(t, entry);
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
                    title={format(dateObj, t("venueHistory.dateTitleFormat"), { locale: dateLocale })}
                  >
                    {t("venueHistory.changedOn", {
                      date: format(dateObj, t("venueHistory.dateFormat")),
                    })}
                  </span>
                  {entry.changed_by_name && (
                    <span className="text-xs font-medium text-gray-500">
                      {t("venueHistory.changedBy", { name: entry.changed_by_name })}
                    </span>
                  )}
                </div>

                {isInsert ? (
                  <p className="text-sm text-green-600 font-medium">{t("venueHistory.venueCreated")}</p>
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
