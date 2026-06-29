import { Bed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SlotBedAvailability } from "@/hooks/booking";

interface RoomBedOverlayProps {
  slots: SlotBedAvailability[];
  hours: number[];
  hourHeight: number;
  startHour: number;
  slotInterval: number;
  openingMinutes: number;
  closingMinutes: number;
}

function bedLabelClass(freeBeds: number): string {
  if (freeBeds === 0) return "text-red-600 dark:text-red-400";
  if (freeBeds === 1) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-700 dark:text-emerald-400";
}

export function RoomBedOverlay({
  slots,
  hours,
  hourHeight,
  startHour,
  slotInterval,
  openingMinutes,
  closingMinutes,
}: RoomBedOverlayProps) {
  if (slots.length === 0) return null;

  const slotHeight = hourHeight * (slotInterval / 60);
  const slotByMinutes = new Map(slots.map((s) => [s.slotMinutes, s]));

  return (
    <div className="absolute inset-0 z-[2] pointer-events-none">
      {hours.map((hour) => {
        const hourStartMinutes = hour * 60;
        const segments: number[] = [];
        for (let offset = 0; offset < 60; offset += slotInterval) {
          const slotMinutes = hourStartMinutes + offset;
          if (slotMinutes < openingMinutes || slotMinutes >= closingMinutes) continue;
          if (slotMinutes + slotInterval > closingMinutes) continue;
          segments.push(slotMinutes);
        }

        return segments.map((slotMinutes) => {
          const slot = slotByMinutes.get(slotMinutes);
          if (!slot) return null;

          const top = ((slotMinutes / 60) - startHour) * hourHeight;

          return (
            <div
              key={`${hour}-${slotMinutes}`}
              className="absolute left-0 right-0 flex items-end justify-center pb-0.5"
              style={{ top: `${top}px`, height: `${slotHeight}px` }}
            >
              {slotMinutes % 60 !== 0 && (
                <div
                  className="absolute left-0 right-0 top-0 border-t border-border/40"
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[9px] font-semibold leading-none bg-background/70 rounded px-0.5",
                  bedLabelClass(slot.freeBeds),
                )}
              >
                <Bed className="h-2 w-2 shrink-0" />
                {slot.freeBeds}/{slot.totalBeds}
              </span>
            </div>
          );
        });
      })}
    </div>
  );
}
