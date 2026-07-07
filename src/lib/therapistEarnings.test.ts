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
