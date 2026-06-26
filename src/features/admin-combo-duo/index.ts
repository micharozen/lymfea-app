import type { CartItem } from '@/components/booking/CreateBookingDialog.schema';
import type { TreatmentPayload } from '@/hooks/booking/useCreateBookingMutation';

/** Kill switch — set to false to disable admin combo duo entirely. */
export const ADMIN_COMBO_DUO_ENABLED = true;

export interface AdminBookingSession {
  sessionKey: string;
  treatmentId: string;
  variantId?: string | null;
  label: string;
  duration: number;
  guestCount: number;
  unitPrice: number;
}

interface TreatmentLike {
  id: string;
  name?: string;
  duration?: number | null;
  price?: number | null;
  treatment_variants?: Array<{
    id: string;
    duration?: number | null;
    price?: number | null;
    guest_count?: number | null;
    label?: string | null;
  }>;
}

type CartDetail = CartItem & { treatment: TreatmentLike | undefined };

export function expandCartToSessions(cartDetails: CartDetail[]): AdminBookingSession[] {
  const sessions: AdminBookingSession[] = [];
  for (const item of cartDetails) {
    const treatment = item.treatment;
    const variant = item.variantId
      ? treatment?.treatment_variants?.find((v) => v.id === item.variantId)
      : null;
    const duration = variant?.duration ?? treatment?.duration ?? 30;
    const unitPrice = variant?.price ?? treatment?.price ?? 0;
    const guestCount = variant?.guest_count ?? 1;
    const baseLabel = treatment?.name ?? 'Soin';
    const variantSuffix = variant?.label ? ` (${variant.label})` : '';

    for (let i = 0; i < item.quantity; i++) {
      const indexSuffix = item.quantity > 1 ? ` #${i + 1}` : '';
      sessions.push({
        sessionKey: `${item.treatmentId}__${item.variantId ?? 'default'}__${i}`,
        treatmentId: item.treatmentId,
        variantId: item.variantId ?? null,
        label: `${baseLabel}${variantSuffix}${indexSuffix}`,
        duration,
        guestCount,
        unitPrice,
      });
    }
  }
  return sessions;
}

export function getSessionCount(cartDetails: Array<CartItem & { treatment: unknown }>): number {
  return cartDetails.reduce((sum, item) => sum + item.quantity, 0);
}

/** N >= 2 solo sessions (guest_count === 1 on each). */
export function isComboDuoEligible(sessions: AdminBookingSession[]): boolean {
  if (!ADMIN_COMBO_DUO_ENABLED) return false;
  return sessions.length >= 2 && sessions.every((s) => s.guestCount === 1);
}

export function buildComboDuoBookingParams(sessions: AdminBookingSession[]) {
  return {
    guestCount: sessions.length,
    duration: Math.max(...sessions.map((s) => s.duration)),
    treatments: sessions.map(
      (s): TreatmentPayload => ({
        treatmentId: s.treatmentId,
        variantId: s.variantId ?? undefined,
      }),
    ),
  };
}

/** Staffing pickers count: combo duo → N sessions; variant duo → requiredGuestCount. */
export function computeStaffingCount(
  comboDuoEnabled: boolean,
  sessionCount: number,
  requiredGuestCount: number,
): number {
  if (comboDuoEnabled) return sessionCount;
  return requiredGuestCount;
}
