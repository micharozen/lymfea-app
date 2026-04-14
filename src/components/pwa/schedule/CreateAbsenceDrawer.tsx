import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Palmtree, Thermometer, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

type AbsenceReason = "vacation" | "sick" | "other";

interface CreateAbsenceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (startDate: string, endDate: string, reason: AbsenceReason, note: string) => void;
  saving?: boolean;
}

const REASONS: { value: AbsenceReason; icon: typeof Palmtree; colorClass: string }[] = [
  { value: "vacation", icon: Palmtree, colorClass: "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  { value: "sick", icon: Thermometer, colorClass: "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  { value: "other", icon: MoreHorizontal, colorClass: "border-gray-400 bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-300" },
];

export function CreateAbsenceDrawer({
  open,
  onOpenChange,
  onSave,
  saving = false,
}: CreateAbsenceDrawerProps) {
  const { t } = useTranslation("pwa");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState<AbsenceReason>("vacation");
  const [note, setNote] = useState("");

  const handleSave = () => {
    if (!startDate || !endDate) return;
    onSave(startDate, endDate, reason, note);
    // Reset form
    setStartDate("");
    setEndDate("");
    setReason("vacation");
    setNote("");
  };

  const today = new Date().toISOString().split("T")[0];
  const isValid = startDate && endDate && endDate >= startDate && startDate >= today;

  const reasonLabel = (value: AbsenceReason) => {
    switch (value) {
      case "vacation": return t("schedule.absenceVacation");
      case "sick": return t("schedule.absenceSick");
      case "other": return t("schedule.absenceOther");
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t("schedule.addAbsence")}</DrawerTitle>
          <DrawerDescription>{t("schedule.noAbsencesDesc")}</DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-2 space-y-4">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t("schedule.absenceStart")}
              </label>
              <input
                type="date"
                value={startDate}
                min={today}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate && e.target.value > endDate) {
                    setEndDate(e.target.value);
                  }
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t("schedule.absenceEnd")}
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate || today}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* Reason selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t("schedule.absenceReason")}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {REASONS.map(({ value, icon: Icon, colorClass }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReason(value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all text-sm font-medium",
                    reason === value
                      ? colorClass
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs">{reasonLabel(value)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t("schedule.absenceNote")}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <DrawerFooter>
          <Button onClick={handleSave} disabled={saving || !isValid} className="w-full">
            {saving ? "..." : t("schedule.addAbsence")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
