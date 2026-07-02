/**
 * Venue-local wall-clock → UTC conversion.
 *
 * A booking stores its date/time as the venue's local wall-clock (e.g. 14:00
 * in the spa's timezone). To emit an ICS DTSTART in UTC — or to compare against
 * `Date.now()` — we must resolve what absolute instant that local time maps to,
 * accounting for the venue's timezone offset (and DST).
 *
 * Falls back to treating the input as UTC when the timezone is unknown, which
 * matches the existing convention across the edge functions.
 */
export function venueLocalToUtc(
  dateStr: string,
  timeStr: string,
  timezone = "UTC",
): Date | null {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute, second = 0] = timeStr.split(":").map(Number);
  if ([year, month, day, hour, minute, second].some((v) => Number.isNaN(v))) {
    return null;
  }
  // Interpret the wall-clock as if it were UTC, then measure how far the target
  // timezone sits from UTC at that instant and shift back by that offset.
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(localAsUtc)).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const asIfLocal = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const timezoneOffsetMs = asIfLocal - localAsUtc;
  return new Date(localAsUtc - timezoneOffsetMs);
}
