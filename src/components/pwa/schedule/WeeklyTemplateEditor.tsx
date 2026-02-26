import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, CalendarCheck } from "lucide-react";
import { format, addMonths, startOfMonth } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShiftInput } from "./ShiftInput";

interface Shift {
  start: string;
  end: string;
}

interface DayPattern {
  enabled: boolean;
  shifts: Shift[];
}

interface WeeklyTemplateEditorProps {
  weeklyPattern: DayPattern[];
  onChange: (pattern: DayPattern[]) => void;
  onApplyToMonth: (year: number, month: number) => void;
  saving?: boolean;
  applying?: boolean;
}

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export function WeeklyTemplateEditor({
  weeklyPattern,
  onChange,
  onApplyToMonth,
  saving = false,
  applying = false,
}: WeeklyTemplateEditorProps) {
  const { t, i18n } = useTranslation("pwa");
  const locale = i18n.language === "fr" ? fr : enUS;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetMonth, setTargetMonth] = useState(() => {
    const next = addMonths(startOfMonth(new Date()), 1);
    return { year: next.getFullYear(), month: next.getMonth() + 1 };
  });

  const handleToggleDay = (dayIndex: number, enabled: boolean) => {
    const updated = [...weeklyPattern];
    updated[dayIndex] = {
      ...updated[dayIndex],
      enabled,
      shifts: enabled && updated[dayIndex].shifts.length === 0
        ? [{ start: "09:00", end: "17:00" }]
        : updated[dayIndex].shifts,
    };
    onChange(updated);
  };

  const handleShiftChange = (dayIndex: number, shiftIndex: number, shift: Shift) => {
    const updated = [...weeklyPattern];
    const shifts = [...updated[dayIndex].shifts];
    shifts[shiftIndex] = shift;
    updated[dayIndex] = { ...updated[dayIndex], shifts };
    onChange(updated);
  };

  const handleAddShift = (dayIndex: number) => {
    const updated = [...weeklyPattern];
    updated[dayIndex] = {
      ...updated[dayIndex],
      shifts: [...updated[dayIndex].shifts, { start: "14:00", end: "18:00" }],
    };
    onChange(updated);
  };

  const handleRemoveShift = (dayIndex: number, shiftIndex: number) => {
    const updated = [...weeklyPattern];
    updated[dayIndex] = {
      ...updated[dayIndex],
      shifts: updated[dayIndex].shifts.filter((_, i) => i !== shiftIndex),
    };
    onChange(updated);
  };

  const handleApplyConfirm = () => {
    setConfirmOpen(false);
    onApplyToMonth(targetMonth.year, targetMonth.month);
  };

  // Generate month options (current + next 3 months)
  const monthOptions = Array.from({ length: 4 }, (_, i) => {
    const d = addMonths(startOfMonth(new Date()), i);
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: format(d, "MMMM yyyy", { locale }) };
  });

  return (
    <div className="space-y-4">
      {/* Days list */}
      <div className="space-y-3">
        {weeklyPattern.map((day, dayIndex) => (
          <div key={dayIndex} className="rounded-lg border border-border p-3 space-y-2">
            {/* Day header with toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium capitalize">
                {t(`schedule.${DAY_KEYS[dayIndex]}`)}
              </span>
              <Switch
                checked={day.enabled}
                onCheckedChange={(checked) => handleToggleDay(dayIndex, checked)}
              />
            </div>

            {/* Shifts */}
            {day.enabled && (
              <div className="space-y-2 pl-1">
                {day.shifts.map((shift, shiftIndex) => (
                  <ShiftInput
                    key={shiftIndex}
                    shift={shift}
                    onChange={(s) => handleShiftChange(dayIndex, shiftIndex, s)}
                    onRemove={day.shifts.length > 1 ? () => handleRemoveShift(dayIndex, shiftIndex) : undefined}
                  />
                ))}
                <button
                  onClick={() => handleAddShift(dayIndex)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  {t("schedule.addShift")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Apply to month */}
      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{t("schedule.applyTemplate")}</span>
        </div>
        <select
          value={`${targetMonth.year}-${targetMonth.month}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            setTargetMonth({ year: y, month: m });
          }}
          className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {monthOptions.map((opt) => (
            <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={applying}
          variant="outline"
          className="w-full"
        >
          {applying ? "..." : t("schedule.applyToMonth", {
            month: format(new Date(targetMonth.year, targetMonth.month - 1), "MMMM yyyy", { locale }),
          })}
        </Button>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("schedule.applyTemplate")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("schedule.applyConfirm", {
                month: format(new Date(targetMonth.year, targetMonth.month - 1), "MMMM yyyy", { locale }),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApplyConfirm}>
              {t("schedule.applyTemplate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
