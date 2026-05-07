import type { BasketItem } from '@/pages/client/context/CartContext';
import { getCartKey } from '@/pages/client/context/CartContext';
import type { BookingDateTime, PerItemSchedule } from '@/pages/client/context/FlowContext';

export interface MultiBookingItem {
  treatmentId: string;
  variantId?: string | null;
  date: string;
  time: string;
  duration: number;
  quantity: number;
  guestCount?: number;
}

/**
 * Zip cart base items with their per-item slot picks into the payload shape
 * expected by `create-draft-booking` and `create-client-booking` (multi mode).
 * Returns null if any base item is missing a slot — caller should validate
 * via FlowContext or `allItemsScheduled` before invoking.
 */
export function buildMultiBookingItems(
  baseItems: BasketItem[],
  perItemSchedule: PerItemSchedule,
): MultiBookingItem[] | null {
  const out: MultiBookingItem[] = [];
  for (const item of baseItems) {
    const key = getCartKey(item.id, item.variantId);
    const slot: BookingDateTime | undefined = perItemSchedule[key];
    if (!slot?.date || !slot?.time) return null;
    out.push({
      treatmentId: item.id,
      variantId: item.variantId ?? null,
      date: slot.date,
      time: slot.time,
      duration: (item.duration || 30) * (item.quantity || 1),
      quantity: item.quantity,
      guestCount: item.guestCount,
    });
  }
  return out;
}
