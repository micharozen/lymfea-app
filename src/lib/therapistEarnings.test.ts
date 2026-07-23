import { describe, it, expect } from "vitest";
import { computeTherapistEarnings } from "./therapistEarnings";

const rates = { rate_60: 30, rate_75: 45, rate_90: 60 };

describe("computeTherapistEarnings — out-of-hours surcharge", () => {
  it("returns the base rate when no surcharge is passed", () => {
    expect(computeTherapistEarnings(rates, 60)).toBe(30);
  });

  it("returns the base rate when surcharge is 0", () => {
    expect(computeTherapistEarnings(rates, 60, { surchargePercent: 0 })).toBe(30);
  });

  it("uplifts the earning by the surcharge percent (20% → ×1.2)", () => {
    expect(computeTherapistEarnings(rates, 60, { surchargePercent: 20 })).toBe(36);
  });

  it("applies the surcharge to interpolated durations too", () => {
    // 90 min → rate_90 = 60, +20% = 72
    expect(computeTherapistEarnings(rates, 90, { surchargePercent: 20 })).toBe(72);
  });

  it("ignores negative surcharge percents", () => {
    expect(computeTherapistEarnings(rates, 60, { surchargePercent: -50 })).toBe(30);
  });

  it("returns null when rates are missing", () => {
    expect(computeTherapistEarnings(null, 60, { surchargePercent: 20 })).toBeNull();
  });
});

describe("computeTherapistEarnings — extra duration brackets", () => {
  const extended = {
    rate_45: 24,
    rate_60: 30,
    rate_75: 45,
    rate_90: 60,
    rate_120: 84,
    rate_150: 105,
  };

  it("uses an exact configured bracket (120 min)", () => {
    expect(computeTherapistEarnings(extended, 120)).toBe(84);
  });

  it("uses the smallest configured bracket exactly (45 min)", () => {
    expect(computeTherapistEarnings(extended, 45)).toBe(24);
  });

  it("interpolates between two configured brackets (105 min → 90↔120)", () => {
    // 90→60, 120→84, midpoint 105 = 72
    expect(computeTherapistEarnings(extended, 105)).toBe(72);
  });

  it("interpolates using a newly added bracket instead of extrapolating (135 min)", () => {
    // 120→84, 150→105, midpoint 135 = 94.5
    expect(computeTherapistEarnings(extended, 135)).toBe(94.5);
  });

  it("pro-rata below the smallest configured bracket (30 min from rate_45)", () => {
    // (24 / 45) * 30 = 16
    expect(computeTherapistEarnings(extended, 30)).toBe(16);
  });

  it("keeps the legacy 60/75/90 behaviour when no extra brackets are set", () => {
    const legacy = { rate_60: 30, rate_75: 45, rate_90: 60 };
    // >90 extrapolates from rate_90: (60/90)*120 = 80
    expect(computeTherapistEarnings(legacy, 120)).toBe(80);
  });
});
