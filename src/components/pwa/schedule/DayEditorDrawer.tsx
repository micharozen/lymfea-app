import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { ShiftInput } from "./ShiftInput";

interface Shift {
  start: string;
  end: string;
}

interface DayEditorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  isAvailable: boolean;
  shifts: Shift[];
  onSave: (date: string, isAvailable: boolean, shifts: Shift[]) => void;
  saving?: boolean;
}

export function DayEditorDrawer({
  open,
  onOpenChange,
  date,
  isAvailable: initialAvailable,
  shifts: initialShifts,
  onSave,
  saving = false,
}: DayEditorDrawerProps) {
  const { t, i18n } = useTranslation("pwa");
  const locale = i18n.language === "fr" ? fr : enUS;

  const [isAvailable, setIsAvailable] = useState(initialAvailable);
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);

  useEffect(() => {
    setIsAvailable(initialAvailable);
    setShifts(initialShifts.length > 0 ? initialShifts : [{ start: "09:00", end: "17:00" }]);
  }, [initialAvailable, initialShifts, date]);

  const handleAddShift = () => {
    setShifts([...shifts, { start: "14:00", end: "18:00" }]);
  };

  const handleRemoveShift = (index: number) => {
    setShifts(shifts.filter((_, i) => i !== index));
  };

  const handleShiftChange = (index: number, shift: Shift) => {
    const updated = [...shifts];
    updated[index] = shift;
    setShifts(updated);
  };

  const handleSave = () => {
    if (!date) return;
    onSave(date, isAvailable, isAvailable ? shifts : []);
  };

  if (!date) return null;

  const dateObj = parseISO(date);
  const formattedDate = format(dateObj, "EEEE d MMMM", { locale });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="capitalize">{formattedDate}</DrawerTitle>
          <DrawerDescription>{t("schedule.editDayDesc")}</DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-2 space-y-4">
          {/* Available toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("schedule.available")}</span>
            <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
          </div>

          {/* Shifts */}
          {isAvailable && (
            <div className="space-y-3">
              <span className="text-sm text-muted-foreground">{t("schedule.shifts")}</span>
              {shifts.map((shift, index) => (
                <ShiftInput
                  key={index}
                  shift={shift}
                  onChange={(s) => handleShiftChange(index, s)}
                  onRemove={shifts.length > 1 ? () => handleRemoveShift(index) : undefined}
                />
              ))}
              <button
                onClick={handleAddShift}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("schedule.addShift")}
              </button>
            </div>
          )}
        </div>

        <DrawerFooter>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "..." : t("schedule.saveDay")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
