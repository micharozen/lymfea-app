/**
 * Per-therapist payout allocation shared by the payment edge functions
 * (stripe-webhook, finalize-payment, mark-tap-to-pay-paid).
 *
 * - Solo booking (≤ 1 therapist): the single therapist is paid on the TOTAL
 *   duration of all treatments, add-ons included.
 * - Duo booking (> 1 therapist): each therapist is paid on their own leg — their
 *   base soin plus the add-ons hanging off it — with their own rates. See
 *   myLegDuration for the exact attribution ladder (stable link, then positional).
 *
 * Out-of-hours surcharge: when the booking is flagged out-of-hours, each earning
 * is uplifted by the venue's surcharge percent (same % the client was charged).
 *
 * Aggregate cap: the sum of therapist amounts can never exceed `capTotal`
 * (typically totalHT − hotelCommission). If it would, every leg is scaled down
 * proportionally so the venue/platform invariant is preserved.
 */

import { computeTherapistEarnings, type TherapistRates } from "./therapistEarnings.ts";
import { myLegDuration } from "./therapistLegDuration.ts";

export interface PayoutTherapist {
  therapist_id: string;
  assigned_at: string | null;
  rates: TherapistRates;
  stripe_account_id: string | null;
}

export interface PayoutLeg {
  therapistId: string;
  stripeAccountId: string | null;
  duration: number;
  /** Earned amount incl. surcharge, after the aggregate cap (rounded to 2 dp). */
  amount: number;
}

export interface BuildPayoutLegsParams {
  therapists: PayoutTherapist[];
  /**
   * Treatments with their duration, whether they are add-ons, and when available
   * the stable soin↔therapist link (booking_treatments.therapist_id). Add-ons are
   * excluded from the guest-soin count and paid to whoever carries them.
   */
  treatments: { duration: number | null; therapist_id?: string | null; is_addon?: boolean | null }[];
  guestCount: number;
  isOutOfHours: boolean;
  /** Venue out_of_hours_surcharge_percent (only applied when isOutOfHours). */
  surchargePercent: number;
  /** Aggregate cap on total therapist amount (e.g. totalHT − hotelCommission). */
  capTotal: number;
}

export interface BuildPayoutLegsResult {
  legs: PayoutLeg[];
  /** Total earned before the aggregate cap. */
  totalEarned: number;
  /** Total amount after the aggregate cap (== Σ legs.amount). */
  totalAmount: number;
  capped: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Load the therapists to pay for a booking (with rates + Stripe account +
 * assigned_at). Uses the accepted `booking_therapists` rows; falls back to the
 * booking's primary therapist when the junction table has no accepted row
 * (older solo bookings). `booking_therapists` has no FK to `therapists`, so the
 * lookup is done in two queries (same pattern as the admin UI).
 */
export async function fetchPayoutTherapists(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  bookingId: string,
  fallbackTherapistId: string | null,
): Promise<PayoutTherapist[]> {
  const { data: bt } = await supabase
    .from("booking_therapists")
    .select("therapist_id, assigned_at")
    .eq("booking_id", bookingId)
    .eq("status", "accepted")
    .order("assigned_at", { ascending: true });

  const assignedAt = new Map<string, string | null>();
  let ids: string[] = (bt || []).map((r: { therapist_id: string; assigned_at: string | null }) => {
    assignedAt.set(r.therapist_id, r.assigned_at);
    return r.therapist_id;
  });

  if (ids.length === 0 && fallbackTherapistId) {
    ids = [fallbackTherapistId];
    assignedAt.set(fallbackTherapistId, null);
  }
  if (ids.length === 0) return [];

  const { data: rows } = await supabase
    .from("therapists")
    .select("id, rate_45, rate_60, rate_75, rate_90, rate_105, rate_120, rate_150, stripe_account_id")
    .in("id", ids);

  type TherapistRateRow = {
    id: string;
    rate_45: number | null;
    rate_60: number | null;
    rate_75: number | null;
    rate_90: number | null;
    rate_105: number | null;
    rate_120: number | null;
    rate_150: number | null;
    stripe_account_id: string | null;
  };

  const byId = new Map(
    (rows || []).map((r: TherapistRateRow) => [r.id, r]),
  );

  // Preserve acceptance order (assigned_at) established above.
  return ids
    .map((id) => {
      const r = byId.get(id) as TherapistRateRow | undefined;
      if (!r) return null;
      return {
        therapist_id: id,
        assigned_at: assignedAt.get(id) ?? null,
        rates: {
          rate_45: r.rate_45,
          rate_60: r.rate_60,
          rate_75: r.rate_75,
          rate_90: r.rate_90,
          rate_105: r.rate_105,
          rate_120: r.rate_120,
          rate_150: r.rate_150,
        },
        stripe_account_id: r.stripe_account_id,
      } as PayoutTherapist;
    })
    .filter((t): t is PayoutTherapist => t !== null);
}

/**
 * Therapist ids that already have a payout row for this booking — used to make
 * payout creation idempotent (skip therapists already paid on retries/webhooks).
 */
export async function fetchPaidTherapistIds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  bookingId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("therapist_payouts")
    .select("therapist_id")
    .eq("booking_id", bookingId);
  return new Set((data || []).map((r: { therapist_id: string }) => r.therapist_id));
}

export function buildTherapistPayoutLegs(
  { therapists, treatments, guestCount, isOutOfHours, surchargePercent, capTotal }: BuildPayoutLegsParams,
): BuildPayoutLegsResult {
  const ordered = [...therapists].sort((a, b) => {
    const ta = a.assigned_at ? Date.parse(a.assigned_at) : 0;
    const tb = b.assigned_at ? Date.parse(b.assigned_at) : 0;
    return ta - tb;
  });

  const pct = isOutOfHours ? (Number(surchargePercent) || 0) : 0;

  // Duration per therapist — same ladder the PWA displays (myLegDuration): stable
  // soin↔therapist link first, positional mapping for legacy/broadcast rows, and
  // in every case the add-ons this therapist carries on top of their soin.
  // A lone therapist is paid on everything, whatever guest_count claims.
  const orderedIds = ordered.map((t) => t.therapist_id);
  const effectiveGuestCount = ordered.length > 1 ? guestCount : 1;

  const raw = ordered.map((t) => {
    const duration = myLegDuration(t.therapist_id, treatments, orderedIds, effectiveGuestCount);
    const earned = computeTherapistEarnings(t.rates, duration, { surchargePercent: pct }) ?? 0;
    return {
      therapistId: t.therapist_id,
      stripeAccountId: t.stripe_account_id,
      duration,
      earned,
    };
  });

  const totalEarned = round2(raw.reduce((sum, r) => sum + r.earned, 0));

  // Aggregate cap: scale every leg down proportionally if the sum overflows.
  let scale = 1;
  if (capTotal >= 0 && totalEarned > capTotal && totalEarned > 0) {
    scale = capTotal / totalEarned;
  }

  const legs: PayoutLeg[] = raw.map((r) => ({
    therapistId: r.therapistId,
    stripeAccountId: r.stripeAccountId,
    duration: r.duration,
    amount: round2(r.earned * scale),
  }));

  const totalAmount = round2(legs.reduce((sum, l) => sum + l.amount, 0));

  return { legs, totalEarned, totalAmount, capped: scale < 1 };
}
