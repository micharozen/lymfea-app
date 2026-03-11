import type { TFunction } from "i18next";

interface ScheduleValues {
  is_available: boolean;
  shifts: { start: string; end: string }[];
  is_manually_edited: boolean;
}

export function describeScheduleChange(
  oldValues: ScheduleValues | null,
  newValues: ScheduleValues | null,
  changeType: string,
  t: TFunction
): string {
  if (changeType === "insert") {
    return newValues?.is_available
      ? t("scheduleAlerts.dayAdded")
      : t("scheduleAlerts.dayAddedUnavailable");
  }

  if (changeType === "delete") {
    return t("scheduleAlerts.dayRemoved");
  }

  // update
  if (oldValues && newValues) {
    if (oldValues.is_available && !newValues.is_available) {
      return t("scheduleAlerts.markedUnavailable");
    }
    if (!oldValues.is_available && newValues.is_available) {
      return t("scheduleAlerts.markedAvailable");
    }
  }

  return t("scheduleAlerts.shiftsChanged");
}

export function formatShiftsSummary(
  shifts: { start: string; end: string }[] | undefined
): string {
  if (!shifts || shifts.length === 0) return "—";
  return shifts.map((s) => `${s.start}–${s.end}`).join(", ");
}
