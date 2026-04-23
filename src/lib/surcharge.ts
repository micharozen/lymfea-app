import { isOutOfHours } from './bookingUtils';

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

/**
 * Client-side mirror of supabase/functions/_shared/surcharge.ts. The server
 * recomputes and persists — this is for display only.
 */
export function computeOutOfHoursSurcharge(
  bookingTime: string | null | undefined,
  basePrice: number,
  hotel: SurchargeConfig | null | undefined,
): SurchargeResult {
  const percent = Number(hotel?.out_of_hours_surcharge_percent ?? 0) || 0;
  const allowed = !!hotel?.allow_out_of_hours_booking;
  const outOfHours =
    !!bookingTime &&
    allowed &&
    isOutOfHours(bookingTime, hotel?.opening_time ?? '', hotel?.closing_time ?? '');

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
