import { describe, it, expect } from "vitest";
import {
  amountsFromRefundPercent,
  canApplyClientTierFinancials,
  parseCancellationTiers,
  resolveRefundPercent,
  validateCancellationTiers,
} from "./cancellationTiers";

describe("resolveRefundPercent", () => {
  const tiers = [
    { max_hours: 24, min_hours: 6, refund_percent: 50 },
    { max_hours: 6, min_hours: 0, refund_percent: 0 },
  ];

  it("blocks at or below cutoff", () => {
    expect(resolveRefundPercent(2, tiers, 2)).toEqual({ status: "blocked" });
    expect(resolveRefundPercent(1.5, tiers, 2)).toEqual({ status: "blocked" });
  });

  it("matches tier by (min, max] interval", () => {
    expect(resolveRefundPercent(12, tiers, 2)).toEqual({ status: "ok", refund_percent: 50 });
    expect(resolveRefundPercent(6.01, tiers, 2)).toEqual({ status: "ok", refund_percent: 50 });
    expect(resolveRefundPercent(6, tiers, 2)).toEqual({ status: "ok", refund_percent: 0 });
    expect(resolveRefundPercent(3, tiers, 2)).toEqual({ status: "ok", refund_percent: 0 });
  });

  it("returns 100% above all tiers", () => {
    expect(resolveRefundPercent(48, tiers, 2)).toEqual({ status: "ok", refund_percent: 100 });
  });
});

describe("amountsFromRefundPercent", () => {
  it("splits deposit into fee and refund", () => {
    expect(amountsFromRefundPercent(100, 50)).toEqual({
      feeApplied: 50,
      refundAmount: 50,
    });
  });
});

describe("validateCancellationTiers", () => {
  it("rejects overlapping tiers", () => {
    const err = validateCancellationTiers([
      { max_hours: 24, min_hours: 6, refund_percent: 50 },
      { max_hours: 12, min_hours: 0, refund_percent: 25 },
    ]);
    expect(err).toBe("tiers must not overlap");
  });

  it("allows touching boundaries at same hour", () => {
    const err = validateCancellationTiers([
      { max_hours: 24, min_hours: 6, refund_percent: 50 },
      { max_hours: 6, min_hours: 0, refund_percent: 0 },
    ]);
    expect(err).toBeNull();
  });
});

describe("parseCancellationTiers", () => {
  it("filters invalid rows and sorts by max_hours desc", () => {
    const parsed = parseCancellationTiers([
      { max_hours: 6, min_hours: 0, refund_percent: 0 },
      { max_hours: 24, min_hours: 6, refund_percent: 50 },
      { max_hours: "bad", min_hours: 0, refund_percent: 10 },
    ]);
    expect(parsed).toEqual([
      { max_hours: 24, min_hours: 6, refund_percent: 50 },
      { max_hours: 6, min_hours: 0, refund_percent: 0 },
    ]);
  });
});

describe("canApplyClientTierFinancials", () => {
  it("is false for room or partner settlement", () => {
    expect(canApplyClientTierFinancials(true, false, true)).toBe(false);
  });

  it("is true for paid refund path", () => {
    expect(canApplyClientTierFinancials(true, false, false)).toBe(true);
  });

  it("is true for payment intent hold", () => {
    expect(canApplyClientTierFinancials(false, true, false)).toBe(true);
  });

  it("is false for card_saved empreinte only", () => {
    expect(canApplyClientTierFinancials(false, false, false)).toBe(false);
  });
});
