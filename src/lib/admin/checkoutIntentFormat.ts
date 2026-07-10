const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
}

export function formatIntentPrice(price: number | null | undefined, currency: string): string {
  if (price == null) return "-";
  return `${price}${currencySymbol(currency)}`;
}

/**
 * The requested slot only lives on the intent when the guest picked a single
 * date/time for the whole cart. Per-item schedules stay inside cart_snapshot.
 */
export function formatIntentSlot(bookingDate: string | null, bookingTime: string | null): string {
  if (!bookingDate) return "—";
  const [year, month, day] = bookingDate.split("-");
  const time = bookingTime ? ` · ${bookingTime.slice(0, 5)}` : "";
  return `${day}/${month}/${year}${time}`;
}
