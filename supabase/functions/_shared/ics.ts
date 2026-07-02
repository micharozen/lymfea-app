// Shared iCalendar (.ics) builder for a booking. Used both by the public
// booking-ics endpoint (served as a downloadable link) and by
// notify-booking-confirmed (attached to the confirmation email), so the two
// stay identical. Times are converted from venue-local to UTC.
import { venueLocalToUtc } from "./venue-time.ts";

/** ICS text escaping: backslash, comma, semicolon, newline. */
export function escapeIcsText(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Format a Date as an ICS UTC timestamp: YYYYMMDDTHHMMSSZ. */
export function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Fold ICS content lines to 75 octets, continuation lines start with a space. */
export function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(" " + rest);
  return chunks.join("\r\n");
}

export interface IcsBookingInput {
  /** bookings.id (uuid) — used for the event UID. */
  id: string;
  /** Human booking number — used for the filename. */
  booking_id?: number | string | null;
  booking_date: string;
  booking_time?: string | null;
  venue_name?: string | null;
  timezone?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  treatments: { name?: string | null; duration?: number | null }[];
}

/**
 * Build the .ics text + suggested filename for a booking. Returns null when the
 * date/time is invalid (caller decides how to handle — 400 vs skip attachment).
 */
export function buildBookingIcs(input: IcsBookingInput): { ics: string; filename: string } | null {
  if (!input.booking_time) return null;
  const start = venueLocalToUtc(input.booking_date, input.booking_time, input.timezone || "UTC");
  if (!start) return null;

  const totalDuration = input.treatments.reduce(
    (sum, t) => sum + (Number(t?.duration) || 0),
    0,
  ) || 60;
  const end = new Date(start.getTime() + totalDuration * 60 * 1000);

  const venueName = input.venue_name || "";
  const location = [input.address, input.postal_code, input.city, input.country]
    .filter(Boolean)
    .join(", ");
  const treatmentNames = input.treatments.map((t) => t?.name).filter(Boolean).join(", ");
  const summary = venueName ? `Soin · ${venueName}` : "Soin";
  const description = treatmentNames || summary;
  const stamp = toIcsUtc(new Date());

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Eia//Booking//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:booking-${input.id}@eiaspa.fr`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(foldLine).join("\r\n") + "\r\n";

  const filename = `reservation-${input.booking_id ?? input.id}.ics`;
  return { ics, filename };
}
