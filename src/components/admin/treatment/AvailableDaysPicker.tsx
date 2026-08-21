import { useTranslation } from "react-i18next";
import { Toggle } from "@/components/ui/toggle";

const DAYS: { value: number; key: string }[] = [
  { value: 1, key: "monday" },
  { value: 2, key: "tuesday" },
  { value: 3, key: "wednesday" },
  { value: 4, key: "thursday" },
  { value: 5, key: "friday" },
  { value: 6, key: "saturday" },
  { value: 0, key: "sunday" },
];

interface AvailableDaysPickerProps {
  /** 0=Dim, 1=Lun, ..., 6=Sam. Liste vide = tous les jours. */
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
  /** Libellé du mode « pas de restriction » — diffère entre un soin et une variante. */
  everyDayLabel?: string;
}

/**
 * Sélecteur de jours autorisés, partagé entre le soin (`treatment_menus.available_days`)
 * et ses variantes (`treatment_variants.available_days`).
 */
export function AvailableDaysPicker({
  value,
  onChange,
  disabled,
  everyDayLabel,
}: AvailableDaysPickerProps) {
  const { t } = useTranslation(["admin", "common"]);
  const isEveryDay = value.length === 0;

  // Le dernier jour coché ne peut pas être décoché : une liste vide
  // signifie « tous les jours », ce qui contredirait le mode choisi.
  const toggle = (day: number) => {
    if (value.includes(day)) {
      if (value.length === 1) return;
      onChange(value.filter((d) => d !== day));
    } else {
      onChange([...value, day]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Toggle
          type="button"
          pressed={isEveryDay}
          onPressedChange={() => onChange([])}
          disabled={disabled}
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
        >
          {everyDayLabel ?? t("availableDays.everyDay")}
        </Toggle>
        <Toggle
          type="button"
          pressed={!isEveryDay}
          onPressedChange={() => onChange(DAYS.map((d) => d.value))}
          disabled={disabled}
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
        >
          {t("availableDays.specificDays")}
        </Toggle>
      </div>
      {!isEveryDay && (
        <div className="flex items-center gap-1.5">
          {DAYS.map((day) => (
            <Toggle
              key={day.value}
              type="button"
              title={t(`availableDays.days.${day.key}`)}
              pressed={value.includes(day.value)}
              onPressedChange={() => toggle(day.value)}
              disabled={disabled}
              size="sm"
              variant="outline"
              className="w-8 h-8 p-0 text-xs font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
            >
              {t(`availableDays.short.${day.key}`)}
            </Toggle>
          ))}
        </div>
      )}
    </div>
  );
}
