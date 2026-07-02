import { createPortal } from "react-dom";
import { addMinutes, format, parse } from "date-fns";
import { Clock, User, DoorOpen, Hotel } from "lucide-react";
import { getBookingStatusConfig } from "@/utils/statusStyles";

interface PreviewTreatment {
  treatment_menus: { name: string; duration?: number } | null;
}

export interface BookingPreviewData {
  booking_time: string;
  client_first_name?: string;
  client_last_name?: string;
  hotel_name?: string;
  room_name?: string | null;
  therapistName?: string | null;
  status: string;
  duration?: number;
  booking_treatments?: PreviewTreatment[];
}

interface BookingPreviewPopoverProps {
  booking: BookingPreviewData | null;
  onClose: () => void;
}

function resolveDuration(booking: BookingPreviewData): number {
  if (booking.duration && booking.duration > 0) return booking.duration;
  const sum = (booking.booking_treatments ?? []).reduce(
    (acc, bt) => acc + (bt.treatment_menus?.duration ?? 0),
    0,
  );
  return sum > 0 ? sum : 60;
}

function formatEnd(startTime: string, durationMin: number): string {
  const parsed = parse(startTime.substring(0, 5), "HH:mm", new Date());
  return format(addMinutes(parsed, durationMin), "HH:mm");
}

function treatmentNames(booking: BookingPreviewData): string {
  return (booking.booking_treatments ?? [])
    .map((bt) => bt.treatment_menus?.name)
    .filter(Boolean)
    .join(", ");
}

/**
 * Floating preview shown on long-press of a booking in the planning.
 * Dismisses on release / tap outside — a lightweight peek that doesn't
 * leave the planning (a plain tap still opens the full detail page).
 */
export function BookingPreviewPopover({ booking, onClose }: BookingPreviewPopoverProps) {
  if (!booking) return null;

  const status = getBookingStatusConfig(booking.status);
  const duration = resolveDuration(booking);
  const endTime = formatEnd(booking.booking_time, duration);
  const treatments = treatmentNames(booking);
  const clientName = [booking.client_first_name, booking.client_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onPointerUp={onClose}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {booking.booking_time?.substring(0, 5)} – {endTime}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.badgeClass}`}>
            {status.label}
          </span>
        </div>

        {clientName && (
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{clientName}</span>
          </div>
        )}

        {treatments && (
          <div className="mb-1.5 text-xs text-muted-foreground">{treatments}</div>
        )}

        {booking.room_name && (
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <DoorOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{booking.room_name}</span>
          </div>
        )}

        {booking.hotel_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hotel className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{booking.hotel_name}</span>
          </div>
        )}

        {booking.therapistName && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{booking.therapistName}</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default BookingPreviewPopover;
