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
 * Total number of treatments across base items, counting quantity.
 * `Massage ×2` counts as 2. Drives the shared/per-item chooser visibility and
 * the "same time" duo guest_count (a duplicated treatment is still 2 people).
 */
export function totalTreatmentCount(baseItems: BasketItem[]): number {
  return baseItems.reduce((sum, i) => sum + (i.quantity || 1), 0);
}

/** A single schedulable unit — one instance of a cart line (quantity expanded). */
export interface BaseUnit {
  item: BasketItem;
  /** Per-instance key: `${getCartKey(id, variantId)}#${unitIndex}`. */
  unitKey: string;
  /** 0-based index of this instance within its cart line. */
  unitIndex: number;
  /** Total instances (quantity) of the parent cart line. */
  unitCount: number;
}

/**
 * Expand cart base items into individual schedulable units, one per quantity.
 * A line with `quantity: 2` yields 2 units so the per-item scheduler can offer
 * a distinct slot for each instance (instead of collapsing them into one).
 */
export function expandBaseUnits(baseItems: BasketItem[]): BaseUnit[] {
  const out: BaseUnit[] = [];
  for (const item of baseItems) {
    const cartKey = getCartKey(item.id, item.variantId);
    const count = Math.max(1, item.quantity || 1);
    for (let i = 0; i < count; i++) {
      out.push({ item, unitKey: `${cartKey}#${i}`, unitIndex: i, unitCount: count });
    }
  }
  return out;
}

/**
 * Zip cart base units (quantity expanded) with their per-item slot picks into
 * the payload shape expected by `create-draft-booking` and
 * `create-client-booking` (multi mode). One booking item per unit, quantity 1.
 * Returns null if any unit is missing a slot — caller should validate
 * via FlowContext or `allItemsScheduled` before invoking.
 */
export function buildMultiBookingItems(
  baseItems: BasketItem[],
  perItemSchedule: PerItemSchedule,
): MultiBookingItem[] | null {
  const out: MultiBookingItem[] = [];
  for (const { item, unitKey } of expandBaseUnits(baseItems)) {
    const slot: BookingDateTime | undefined = perItemSchedule[unitKey];
    if (!slot?.date || !slot?.time) return null;
    out.push({
      treatmentId: item.id,
      variantId: item.variantId ?? null,
      date: slot.date,
      time: slot.time,
      duration: item.duration || 30,
      quantity: 1,
      guestCount: item.guestCount,
    });
  }
  return out;
}
