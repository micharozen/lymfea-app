function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function isOutOfHours(
  time: string,
  openingTime: string | null | undefined,
  closingTime: string | null | undefined,
): boolean {
  if (!time || !openingTime || !closingTime) return false;
  const start = timeToMinutes(time);
  return start < timeToMinutes(openingTime) || start >= timeToMinutes(closingTime);
}

export interface SurchargeConfig {
  allow_out_of_hours_booking?: boolean | null;
  out_of_hours_surcharge_percent?: number | string | null;
  opening_time?: string | null;
  closing_time?: string | null;
}

export interface SurchargeResult {
  isOutOfHours: boolean;
  surchargeAmount: number;
  surchargePercent: number;
  totalWithSurcharge: number;
}

export function computeOutOfHoursSurcharge(
  bookingTime: string,
  basePrice: number,
  hotel: SurchargeConfig,
): SurchargeResult {
  const percent = Number(hotel.out_of_hours_surcharge_percent ?? 0) || 0;
  const allowed = !!hotel.allow_out_of_hours_booking;
  const outOfHours =
    allowed &&
    isOutOfHours(bookingTime, hotel.opening_time, hotel.closing_time);

  const surchargeAmount = outOfHours
    ? Math.round((basePrice * percent) / 100)
    : 0;

  return {
    isOutOfHours: outOfHours,
    surchargeAmount,
    surchargePercent: percent,
    totalWithSurcharge: basePrice + surchargeAmount,
  };
}
