import type { CartItem } from "@/components/booking/CreateBookingDialog.schema";

export interface TreatmentVariant {
  id: string;
  label?: string | null;
  price?: number | null;
  duration?: number | null;
  is_default?: boolean;
  guest_count?: number;
  available_days?: number[] | null;
}

export interface TreatmentWithVariants {
  id?: string;
  name?: string | null;
  price?: number | null;
  duration?: number | null;
  treatment_variants?: TreatmentVariant[];
}

export function getSelectedVariant(
  treatment: TreatmentWithVariants | null | undefined,
  variantId: string | null | undefined,
): TreatmentVariant | null {
  if (!treatment || !variantId) return null;
  return treatment.treatment_variants?.find((v) => v.id === variantId) ?? null;
}

export function getCartLineDisplayName(
  treatment: TreatmentWithVariants | null | undefined,
  variantId: string | null | undefined,
  fallbackName = "Service",
): string {
  const baseName = treatment?.name?.trim() || fallbackName;
  const variant = getSelectedVariant(treatment, variantId);
  const suffix = variant?.label?.trim();
  return suffix ? `${baseName} · ${suffix}` : baseName;
}

export function getCartLineUnitPrice(
  treatment: TreatmentWithVariants | null | undefined,
  variantId: string | null | undefined,
  priceOverride?: number | null,
): number {
  if (priceOverride !== null && priceOverride !== undefined) return priceOverride;
  const variant = getSelectedVariant(treatment, variantId);
  return variant?.price ?? treatment?.price ?? 0;
}

export function getCartLineUnitDuration(
  treatment: TreatmentWithVariants | null | undefined,
  variantId: string | null | undefined,
): number {
  const variant = getSelectedVariant(treatment, variantId);
  return variant?.duration ?? treatment?.duration ?? 0;
}

export interface CartLineDetail extends CartItem {
  treatment?: TreatmentWithVariants;
}

export function getCartLineTotalPrice(item: CartLineDetail): number {
  return getCartLineUnitPrice(item.treatment, item.variantId, item.priceOverride) * item.quantity;
}

/** Payload shape for SendBookingNotificationDialog / BookingData.treatments */
export function mapCartDetailToTreatmentLine(item: CartLineDetail): {
  name: string;
  price: number;
} {
  return {
    name: getCartLineDisplayName(item.treatment, item.variantId),
    price: getCartLineTotalPrice(item),
  };
}
