import { SelectField } from "@/components/ui/select-field";

const HOURS = Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, '0'));

interface TimeSelectProps {
  /** Valeur au format "HH:MM" — chaîne vide tant que rien n'est choisi. */
  value: string | undefined;
  onChange: (value: string) => void;
  /** Minutes proposées, dépendantes du pas de réservation du lieu. */
  minuteOptions: string[];
  /** Date du créneau, utilisée pour griser les heures indisponibles. */
  date: Date | undefined;
  isHourUnavailable: (date: Date | undefined, hour: string) => boolean;
  isMinuteUnavailable: (date: Date | undefined, hour: string, minute: string) => boolean;
}

const UNAVAILABLE_CLASS = "opacity-40 text-muted-foreground";

/** Sélecteur heure:minute d'un créneau de réservation. */
export function TimeSelect({
  value,
  onChange,
  minuteOptions,
  date,
  isHourUnavailable,
  isMinuteUnavailable,
}: TimeSelectProps) {
  const [hour, minute] = (value ?? '').split(':');

  return (
    <>
      <SelectField
        options={HOURS.map((h) => ({
          value: h,
          label: h,
          className: isHourUnavailable(date, h) ? UNAVAILABLE_CLASS : undefined,
        }))}
        value={hour || undefined}
        onChange={(h) => onChange(`${h}:${minute || '00'}`)}
        placeholder="HH"
        searchable={false}
        className="w-[92px]"
        contentClassName="w-[86px]"
        aria-label="Heure"
      />
      <span className="flex items-center text-muted-foreground">:</span>
      <SelectField
        options={minuteOptions.map((m) => ({
          value: m,
          label: m,
          className: isMinuteUnavailable(date, hour || '09', m) ? UNAVAILABLE_CLASS : undefined,
        }))}
        value={minute || undefined}
        onChange={(m) => onChange(`${hour || '09'}:${m}`)}
        placeholder="MM"
        searchable={false}
        className="w-[92px]"
        contentClassName="w-[86px]"
        aria-label="Minutes"
      />
    </>
  );
}
