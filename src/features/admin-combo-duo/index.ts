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
  /** An amenity (pool/sauna access) needs no therapist: never a guest, never a leg. */
  isAmenity: boolean;
}

interface TreatmentLike {
  id: string;
  name?: string;
  duration?: number | null;
  price?: number | null;
  is_addon?: boolean | null;
  amenity_id?: string | null;
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
    const isAmenity = treatment?.amenity_id != null;

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
        isAmenity,
      });
    }
  }
  return sessions;
}

export function getSessionCount(cartDetails: Array<CartItem & { treatment: unknown }>): number {
  return cartDetails.reduce((sum, item) => sum + item.quantity, 0);
}

/** The parallel legs of a booking: one base soin per guest. Add-ons hang off a base,
 * amenities need no therapist — neither is a leg. */
const basesOf = (sessions: AdminBookingSession[]) =>
  sessions.filter((s) => !s.isAddon && !s.isAmenity);

/** How many base soins (guests) are in the cart — add-ons and amenities don't count. */
export function getBaseSessionCount(sessions: AdminBookingSession[]): number {
  return basesOf(sessions).length;
}

/**
 * Round-robin default: base soin `i` goes to practitioner `i % practitionerCount`.
 * With `practitionerCount === baseCount` this is the identity [0,1,2,…] — the
 * historical "one practitioner per soin" behaviour.
 */
export function defaultLegAssignments(baseCount: number, practitionerCount: number): number[] {
  const n = Math.max(1, practitionerCount);
  return Array.from({ length: baseCount }, (_, i) => i % n);
}

/** Every practitioner slot 0..N-1 must carry at least one base soin (no empty leg). */
export function isValidPartition(legAssignments: number[], practitionerCount: number): boolean {
  if (practitionerCount < 1) return false;
  const filled = new Set(legAssignments);
  for (let leg = 0; leg < practitionerCount; leg++) {
    if (!filled.has(leg)) return false;
  }
  return true;
}

/** One practitioner's slice of a combo-duo: their base soins + add-ons, run sequentially. */
export interface Leg {
  legIndex: number;
  /** Payload lines (bases then add-ons) all carrying this leg's index. */
  treatmentLines: TreatmentPayload[];
  /** Sum of every soin in the leg (sequential) — the leg's own booking duration. */
  durationSum: number;
  /** Sum of every soin's unit price in the leg — the leg's own booking price. */
  priceSum: number;
  /** Human labels of the base soins in this leg (for the therapist-step recap). */
  baseLabels: string[];
}

/**
 * Partition the cart's base soins into `practitionerCount` legs following
 * `legAssignments` (base soin index → practitioner index). Soins sharing a leg run
 * sequentially, so their durations sum. Add-ons are attributed round-robin over the
 * legs and extend the leg they land on. Amenities belong to no leg.
 *
 * Falls back to the identity partition (one base per leg) when no assignments are
 * given — preserving the original combo-duo behaviour.
 */
export function buildLegs(
  sessions: AdminBookingSession[],
  legAssignments?: number[],
): Leg[] {
  const bases = basesOf(sessions);
  const addons = sessions.filter((s) => s.isAddon && !s.isAmenity);
  const assignments =
    legAssignments && legAssignments.length === bases.length
      ? legAssignments
      : bases.map((_, i) => i);
  const practitionerCount = assignments.length ? Math.max(...assignments) + 1 : 0;

  const legs: Leg[] = Array.from({ length: practitionerCount }, (_, legIndex) => ({
    legIndex,
    treatmentLines: [],
    durationSum: 0,
    priceSum: 0,
    baseLabels: [],
  }));

  bases.forEach((s, i) => {
    const legIndex = assignments[i] ?? 0;
    const leg = legs[legIndex];
    leg.durationSum += s.duration;
    leg.priceSum += s.unitPrice;
    leg.baseLabels.push(s.label);
    leg.treatmentLines.push({
      treatmentId: s.treatmentId,
      variantId: s.variantId ?? undefined,
      isAddon: false,
      legIndex,
    });
  });

  addons.forEach((s, j) => {
    const legIndex = practitionerCount > 0 ? j % practitionerCount : 0;
    const leg = legs[legIndex];
    leg.durationSum += s.duration;
    leg.priceSum += s.unitPrice;
    // The add-on hangs off the first base soin of its leg.
    const parentBase = bases.find((_, i) => (assignments[i] ?? 0) === legIndex);
    leg.treatmentLines.push({
      treatmentId: s.treatmentId,
      variantId: s.variantId ?? undefined,
      isAddon: true,
      legIndex,
      parentTreatmentId: parentBase?.treatmentId ?? null,
    });
  });

  return legs;
}

/**
 * Eligible when there are >= 2 base solo soins (add-ons and amenities excluded):
 * those are the guests done in parallel. A single base + an add-on is a solo +
 * supplement, not a duo. Same for a soin + a pool access: still one guest. A base
 * already carrying a variant-duo (guest_count > 1) disqualifies it.
 */
export function isComboDuoEligible(sessions: AdminBookingSession[]): boolean {
  if (!ADMIN_COMBO_DUO_ENABLED) return false;
  const bases = basesOf(sessions);
  return bases.length >= 2 && bases.every((s) => s.guestCount === 1);
}

/**
 * Combo-duo params. Base soins are the parallel legs (one guest each); add-ons
 * are attributed to a guest round-robin and run after that guest's soin, so the
 * slot lasts as long as the longest leg (base + its add-ons) — mirroring the
 * server's computeSlotDuration. Each line carries its `legIndex` (the person)
 * so the creator sets a consistent therapist_id and parent link at insert time.
 *
 * Amenity lines belong to no leg: they stay in the booking but carry no legIndex
 * (hence no therapist) and never inflate the slot — same rule as computeSlotDuration.
 */
export function buildComboDuoBookingParams(
  sessions: AdminBookingSession[],
  legAssignments?: number[],
) {
  const amenities = sessions.filter((s) => s.isAmenity);
  const legs = buildLegs(sessions, legAssignments);
  const guestCount = legs.length;

  const legLines = legs.flatMap((leg) => leg.treatmentLines);
  const legDurations = legs.map((leg) => leg.durationSum);

  const amenityLines = amenities.map(
    (s): TreatmentPayload => ({
      treatmentId: s.treatmentId,
      variantId: s.variantId ?? undefined,
      isAmenity: true,
    }),
  );

  return {
    guestCount,
    duration: legDurations.length ? Math.max(...legDurations) : 0,
    treatments: [...legLines, ...amenityLines],
  };
}

/**
 * Staffing pickers count: combo duo → the chosen practitioner count (defaults to
 * one per base soin); variant duo → requiredGuestCount.
 */
export function computeStaffingCount(
  comboDuoEnabled: boolean,
  practitionerCount: number,
  requiredGuestCount: number,
): number {
  if (comboDuoEnabled) return practitionerCount;
  return requiredGuestCount;
}
