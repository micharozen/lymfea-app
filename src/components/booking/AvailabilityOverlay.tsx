import type { HourAvailability } from "@/hooks/booking";

interface AvailabilityOverlayProps {
  hourAvailability: HourAvailability[];
  hours: number[];
  hourHeight: number;
  startHour: number;
}

const levelStyles: Record<string, string> = {
  full: "bg-emerald-50/40 dark:bg-emerald-950/15",
  low: "bg-amber-50/50 dark:bg-amber-950/20",
  none: "",
  blocked: "",
};

export function AvailabilityOverlay({
  hourAvailability,
  hours,
  hourHeight,
  startHour,
}: AvailabilityOverlayProps) {
  // Build a lookup map for quick access
  const availMap = new Map(hourAvailability.map((h) => [h.hour, h]));

  return (
    <div className="absolute inset-0 z-[1] pointer-events-none">
      {hours.map((hour) => {
        const avail = availMap.get(hour);
        if (!avail || avail.level === "blocked") return null;

        const top = (hour - startHour) * hourHeight;

        if (avail.level === "none") {
          return (
            <div
              key={hour}
              className="absolute left-0 right-0"
              style={{
                top: `${top}px`,
                height: `${hourHeight}px`,
                backgroundImage:
                  "repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(239, 68, 68, 0.07) 4px, rgba(239, 68, 68, 0.07) 8px)",
              }}
            />
          );
        }

        const bg = levelStyles[avail.level];
        if (!bg) return null;

        return (
          <div
            key={hour}
            className={`absolute left-0 right-0 ${bg}`}
            style={{
              top: `${top}px`,
              height: `${hourHeight}px`,
            }}
          />
        );
      })}
    </div>
  );
}
