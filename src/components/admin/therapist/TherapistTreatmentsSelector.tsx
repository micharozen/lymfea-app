import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useVenueTreatmentMenus } from "@/hooks/useVenueTreatmentMenus";

interface VenueSectionProps {
  hotelId: string;
  hotelName: string;
  showHeader: boolean;
  selectedIds: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/** Prestations d'un lieu, groupées par catégorie. */
function VenueSection({
  hotelId,
  hotelName,
  showHeader,
  selectedIds,
  onChange,
  disabled,
}: VenueSectionProps) {
  const { t, i18n } = useTranslation("admin");
  const { data: treatments, isLoading } = useVenueTreatmentMenus(hotelId);

  const venueIds = (treatments ?? []).map((tr) => tr.id);
  const allChecked =
    venueIds.length > 0 && venueIds.every((id) => selectedIds.includes(id));

  const toggleOne = (id: string, checked: boolean) => {
    if (checked) {
      if (!selectedIds.includes(id)) onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter((s) => s !== id));
    }
  };

  const toggleAll = () => {
    if (allChecked) {
      onChange(selectedIds.filter((id) => !venueIds.includes(id)));
    } else {
      onChange([...new Set([...selectedIds, ...venueIds])]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!treatments || treatments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        {t("therapistTreatments.noTreatmentsForVenue", {
          venue: hotelName,
          defaultValue: "Aucune prestation active pour {{venue}}.",
        })}
      </div>
    );
  }

  // Regroupement par catégorie, dans l'ordre renvoyé par la requête.
  const byCategory = treatments.reduce<Record<string, typeof treatments>>(
    (acc, tr) => {
      (acc[tr.category] ??= []).push(tr);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-3">
      {/* Le nom du lieu n'a de sens qu'avec plusieurs sections ; le « tout
          cocher » reste utile même sur un lieu unique. */}
      <div className="flex items-center justify-between gap-2">
        {showHeader ? (
          <h4 className="text-sm font-semibold">{hotelName}</h4>
        ) : (
          <span />
        )}
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={toggleAll}
            disabled={disabled}
          >
            {allChecked
              ? t("therapistTreatments.unselectAll", {
                  defaultValue: "Tout décocher",
                })
              : t("therapistTreatments.selectAll", {
                  defaultValue: "Tout cocher",
                })}
        </Button>
      </div>

      {Object.entries(byCategory).map(([category, items]) => (
        <div key={category} className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {category}
          </div>
          {items.map((tr) => {
            const label =
              i18n.language.startsWith("en") && tr.name_en
                ? tr.name_en
                : tr.name;
            return (
              <label
                key={tr.id}
                className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  checked={selectedIds.includes(tr.id)}
                  onCheckedChange={(v) => toggleOne(tr.id, v === true)}
                  disabled={disabled}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{label}</div>
                  {tr.duration ? (
                    <div className="text-xs text-muted-foreground">
                      {tr.duration} min
                    </div>
                  ) : null}
                </div>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface TherapistTreatmentsSelectorProps {
  /** Lieux auxquels le thérapeute est rattaché. */
  venues: Array<{ id: string; name: string }>;
  /** Ids des prestations sélectionnées (composant contrôlé). */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/**
 * Sélection des prestations qu'un thérapeute peut réaliser, par lieu.
 *
 * Remplace le multi-select de spécialités : une prestation précise plutôt
 * qu'une catégorie. Add-ons et amenities sont exclus (cf. useVenueTreatmentMenus).
 */
export function TherapistTreatmentsSelector({
  venues,
  value,
  onChange,
  disabled,
}: TherapistTreatmentsSelectorProps) {
  const { t } = useTranslation("admin");

  if (venues.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        {t("therapistTreatments.assignVenueFirst", {
          defaultValue:
            "Rattachez d'abord le thérapeute à un lieu pour choisir ses prestations.",
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {value.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {t("therapistTreatments.noneWarning", {
              defaultValue:
                "Aucune prestation associée — ce thérapeute ne recevra aucune réservation.",
            })}
          </span>
        </div>
      )}

      {venues.map((venue) => (
        <VenueSection
          key={venue.id}
          hotelId={venue.id}
          hotelName={venue.name}
          showHeader={venues.length > 1}
          selectedIds={value}
          onChange={onChange}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
