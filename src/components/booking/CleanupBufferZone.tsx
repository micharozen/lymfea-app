import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, DoorOpen } from "lucide-react";
import { CALENDAR_CONSTANTS } from "@/hooks/booking/useCalendarLogic";

interface CleanupBufferZoneProps {
  /** Room turnover buffer in minutes for the booking's venue. */
  bufferMinutes: number;
  /** Top (px) of the parent booking block. */
  bookingTop: number;
  /** Height (px) of the parent booking block. */
  bookingHeight: number;
  /** Treatment room name, shown under the label when the zone is tall enough. */
  roomName?: string | null;
  /** Horizontal placement (left/width) copied from the parent booking card. */
  style?: CSSProperties;
}

// Hatched gray zone drawn directly below a booking to visualize the
// "remise en état" (room turnover) time blocked after each treatment.
// Purely visual — not interactive, and kept below bookings (z-0) so any
// real reservation drawn on top stays visible.
export function CleanupBufferZone({
  bufferMinutes,
  bookingTop,
  bookingHeight,
  roomName,
  style,
}: CleanupBufferZoneProps) {
  const { t } = useTranslation("admin");

  if (!bufferMinutes || bufferMinutes <= 0) return null;

  const top = bookingTop + bookingHeight;
  const height = (bufferMinutes / 60) * CALENDAR_CONSTANTS.HOUR_HEIGHT;
  const showLabel = height >= 24;
  const showRoom = !!roomName && height >= 40;

  return (
    <div
      className="absolute z-0 rounded-b border border-dashed border-muted-foreground/30 bg-muted/40 pointer-events-none overflow-hidden flex flex-col items-center justify-center gap-0.5 px-1"
      style={{
        ...style,
        top: `${top}px`,
        height: `${height}px`,
        backgroundImage:
          "repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.12) 0, hsl(var(--muted-foreground) / 0.12) 4px, transparent 4px, transparent 8px)",
      }}
    >
      {showLabel && (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide leading-none text-foreground/70 min-w-0 max-w-full">
          <Sparkles className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">{t("calendar.cleanupBuffer", "Remise en état")}</span>
        </span>
      )}
      {showRoom && (
        <span
          className="flex items-center gap-1 text-[10px] font-medium leading-none text-muted-foreground min-w-0 max-w-full"
          title={roomName ?? undefined}
        >
          <DoorOpen className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">{roomName}</span>
        </span>
      )}
    </div>
  );
}
