/**
 * Check if a booking time falls outside the venue's operating hours.
 * Only checks if the booking *starts* outside hours (before opening or at/after closing).
 */
export function isOutOfHours(
  time: string,
  openingTime: string,
  closingTime: string,
): boolean {
  if (!time || !openingTime || !closingTime) return false;
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const start = toMin(time);
  return start < toMin(openingTime) || start >= toMin(closingTime);
}
