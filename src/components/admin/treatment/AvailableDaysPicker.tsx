import { Toggle } from "@/components/ui/toggle";

const DAYS: { value: number; label: string; title: string }[] = [
  { value: 1, label: "L", title: "Lundi" },
  { value: 2, label: "M", title: "Mardi" },
  { value: 3, label: "M", title: "Mercredi" },
  { value: 4, label: "J", title: "Jeudi" },
  { value: 5, label: "V", title: "Vendredi" },
  { value: 6, label: "S", title: "Samedi" },
  { value: 0, label: "D", title: "Dimanche" },
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
  everyDayLabel = "Tous les jours",
}: AvailableDaysPickerProps) {
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
          {everyDayLabel}
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
          Jours spécifiques
        </Toggle>
      </div>
      {!isEveryDay && (
        <div className="flex items-center gap-1.5">
          {DAYS.map((day) => (
            <Toggle
              key={day.value}
              type="button"
              title={day.title}
              pressed={value.includes(day.value)}
              onPressedChange={() => toggle(day.value)}
              disabled={disabled}
              size="sm"
              variant="outline"
              className="w-8 h-8 p-0 text-xs font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
            >
              {day.label}
            </Toggle>
          ))}
        </div>
      )}
    </div>
  );
}
