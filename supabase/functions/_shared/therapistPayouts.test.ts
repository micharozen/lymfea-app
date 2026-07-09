import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  buildTherapistPayoutLegs,
  type PayoutTherapist,
} from "./therapistPayouts.ts";

const RATES = { rate_60: 30, rate_75: 40, rate_90: 45 };
const CAP = 1_000_000; // high enough to never scale legs down

function therapist(id: string, assignedAt: string | null): PayoutTherapist {
  return { therapist_id: id, assigned_at: assignedAt, rates: RATES, stripe_account_id: null };
}

function durationOf(
  legs: { therapistId: string; duration: number }[],
  id: string,
): number {
  return legs.find((l) => l.therapistId === id)?.duration ?? -1;
}

// The stable link must win over acceptance order: here therapist B accepted
// first (ordered [B, A]) but the 60-min soin is A's and the 90-min soin is B's.
// Positional allocation would pay A on 90 and B on 60 — the link fixes it.
Deno.test("combo-duo: link overrides positional acceptance order", () => {
  const { legs } = buildTherapistPayoutLegs({
    therapists: [
      therapist("B", "2026-01-01T10:00:00Z"),
      therapist("A", "2026-01-01T11:00:00Z"),
    ],
    treatments: [
      { duration: 60, therapist_id: "A" },
      { duration: 90, therapist_id: "B" },
    ],
    guestCount: 2,
    isOutOfHours: false,
    surchargePercent: 0,
    capTotal: CAP,
  });

  assertEquals(durationOf(legs, "A"), 60);
  assertEquals(durationOf(legs, "B"), 90);
});

// No link (legacy/broadcast rows) → fall back to the positional mapping.
Deno.test("duo: falls back to positional mapping when link absent", () => {
  const { legs } = buildTherapistPayoutLegs({
    therapists: [
      therapist("A", "2026-01-01T10:00:00Z"),
      therapist("B", "2026-01-01T11:00:00Z"),
    ],
    treatments: [
      { duration: 60, therapist_id: null },
      { duration: 90, therapist_id: null },
    ],
    guestCount: 2,
    isOutOfHours: false,
    surchargePercent: 0,
    capTotal: CAP,
  });

  // ordered = [A, B]; positional → A on treatments[0]=60, B on treatments[1]=90.
  assertEquals(durationOf(legs, "A"), 60);
  assertEquals(durationOf(legs, "B"), 90);
});

// Solo with the link: the single therapist is paid on the SUM of their soins.
Deno.test("solo: link sums the therapist's own soins", () => {
  const { legs } = buildTherapistPayoutLegs({
    therapists: [therapist("A", "2026-01-01T10:00:00Z")],
    treatments: [
      { duration: 60, therapist_id: "A" },
      { duration: 90, therapist_id: "A" },
    ],
    guestCount: 1,
    isOutOfHours: false,
    surchargePercent: 0,
    capTotal: CAP,
  });

  assertEquals(durationOf(legs, "A"), 150);
});

// Shared-duo (single soin done in parallel, link absent) → both therapists on it.
Deno.test("shared-duo: both therapists paid on the shared soin", () => {
  const { legs } = buildTherapistPayoutLegs({
    therapists: [
      therapist("A", "2026-01-01T10:00:00Z"),
      therapist("B", "2026-01-01T11:00:00Z"),
    ],
    treatments: [{ duration: 90, therapist_id: null }],
    guestCount: 2,
    isOutOfHours: false,
    surchargePercent: 0,
    capTotal: CAP,
  });

  assertEquals(durationOf(legs, "A"), 90);
  assertEquals(durationOf(legs, "B"), 90);
});
