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
  /** An add-on is a supplement performed after a base soin, never a guest's own soin. */
  isAddon: boolean;
}

interface TreatmentLike {
  id: string;
  name?: string;
  duration?: number | null;
  price?: number | null;
  is_addon?: boolean | null;
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

    const isAddon = treatment?.is_addon ?? false;

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
        isAddon,
      });
    }
  }
  return sessions;
}

export function getSessionCount(cartDetails: Array<CartItem & { treatment: unknown }>): number {
  return cartDetails.reduce((sum, item) => sum + item.quantity, 0);
}

/** How many base soins (guests) are in the cart — add-ons don't count. */
export function getBaseSessionCount(sessions: AdminBookingSession[]): number {
  return sessions.filter((s) => !s.isAddon).length;
}

/**
 * Eligible when there are >= 2 base solo soins (add-ons excluded): those are the
 * guests done in parallel. A single base + an add-on is a solo + supplement, not
 * a duo. A base already carrying a variant-duo (guest_count > 1) disqualifies it.
 */
export function isComboDuoEligible(sessions: AdminBookingSession[]): boolean {
  if (!ADMIN_COMBO_DUO_ENABLED) return false;
  const bases = sessions.filter((s) => !s.isAddon);
  return bases.length >= 2 && bases.every((s) => s.guestCount === 1);
}

/**
 * Combo-duo params. Base soins are the parallel legs (one guest each); add-ons
 * are attributed to a guest round-robin and run after that guest's soin, so the
 * slot lasts as long as the longest leg (base + its add-ons) — mirroring the
 * server's computeSlotDuration. Each line carries its `legIndex` (the person)
 * so the creator sets a consistent therapist_id and parent link at insert time.
 */
export function buildComboDuoBookingParams(sessions: AdminBookingSession[]) {
  const bases = sessions.filter((s) => !s.isAddon);
  const addons = sessions.filter((s) => s.isAddon);
  const guestCount = bases.length;

  const legDurations = bases.map((s) => s.duration);
  const baseLines = bases.map(
    (s, legIndex): TreatmentPayload => ({
      treatmentId: s.treatmentId,
      variantId: s.variantId ?? undefined,
      isAddon: false,
      legIndex,
    }),
  );

  const addonLines = addons.map((s, j): TreatmentPayload => {
    const legIndex = guestCount > 0 ? j % guestCount : 0;
    legDurations[legIndex] = (legDurations[legIndex] ?? 0) + s.duration;
    return {
      treatmentId: s.treatmentId,
      variantId: s.variantId ?? undefined,
      isAddon: true,
      legIndex,
      parentTreatmentId: bases[legIndex]?.treatmentId ?? null,
    };
  });

  return {
    guestCount,
    duration: legDurations.length ? Math.max(...legDurations) : 0,
    treatments: [...baseLines, ...addonLines],
  };
}

/** Staffing pickers count: combo duo → one per base soin; variant duo → requiredGuestCount. */
export function computeStaffingCount(
  comboDuoEnabled: boolean,
  baseSessionCount: number,
  requiredGuestCount: number,
): number {
  if (comboDuoEnabled) return baseSessionCount;
  return requiredGuestCount;
}
