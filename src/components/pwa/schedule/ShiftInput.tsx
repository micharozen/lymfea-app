import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Shift {
  start: string;
  end: string;
}

interface ShiftInputProps {
  shift: Shift;
  onChange: (shift: Shift) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

const timeOptions: string[] = [];
for (let h = 6; h <= 23; h++) {
  for (let m = 0; m < 60; m += 30) {
    timeOptions.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  }
}

export function ShiftInput({ shift, onChange, onRemove, disabled }: ShiftInputProps) {
  const { t } = useTranslation("pwa");

  return (
    <div className="flex items-center gap-2">
      <select
        value={shift.start}
        onChange={(e) => onChange({ ...shift, start: e.target.value })}
        disabled={disabled}
        className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {timeOptions.map((time) => (
          <option key={time} value={time}>
            {time}
          </option>
        ))}
      </select>

      <span className="text-muted-foreground text-sm">-</span>

      <select
        value={shift.end}
        onChange={(e) => onChange({ ...shift, end: e.target.value })}
        disabled={disabled}
        className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {timeOptions.map((time) => (
          <option key={time} value={time}>
            {time}
          </option>
        ))}
      </select>

      {onRemove && (
        <button
          onClick={onRemove}
          disabled={disabled}
          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
