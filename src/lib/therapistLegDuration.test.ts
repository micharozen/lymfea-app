import { describe, it, expect } from "vitest";
import { myLegDuration, estimateTherapistShare } from "./therapistLegDuration";

describe("myLegDuration", () => {
  it("solo (guestCount ≤ 1): sums every treatment duration", () => {
    const treatments = [
      { therapist_id: null, duration: 60 },
      { therapist_id: null, duration: 30 },
    ];
    expect(myLegDuration("me", treatments, [], 1)).toBe(90);
  });

  it("combo-duo with stable link: only my own soin", () => {
    const treatments = [
      { therapist_id: "me", duration: 60 },
      { therapist_id: "other", duration: 90 },
    ];
    expect(myLegDuration("me", treatments, ["me", "other"], 2)).toBe(60);
    expect(myLegDuration("other", treatments, ["me", "other"], 2)).toBe(90);
  });

  it("secondary therapist with stable link: their own soin", () => {
    const treatments = [
      { therapist_id: "primary", duration: 75 },
      { therapist_id: "me", duration: 45 },
    ];
    expect(myLegDuration("me", treatments, ["primary", "me"], 2)).toBe(45);
  });

  it("old duo without stable link: positional fallback by assigned order", () => {
    const treatments = [
      { therapist_id: null, duration: 60 },
      { therapist_id: null, duration: 90 },
    ];
    expect(myLegDuration("t1", treatments, ["t1", "t2"], 2)).toBe(60);
    expect(myLegDuration("t2", treatments, ["t1", "t2"], 2)).toBe(90);
  });

  it("shared-duo fallback: single soin done in parallel → its full duration", () => {
    const treatments = [{ therapist_id: null, duration: 60 }];
    expect(myLegDuration("t1", treatments, ["t1", "t2"], 2)).toBe(60);
    expect(myLegDuration("t2", treatments, ["t1", "t2"], 2)).toBe(60);
  });

  it("shared-duo with the lone soin claimed: the other therapist still works it in parallel", () => {
    const treatments = [{ therapist_id: "other", duration: 60 }];
    expect(myLegDuration("me", treatments, ["other", "me"], 2)).toBe(60);
  });

  it("combo-duo: my leg is my soin plus the add-ons hanging off it", () => {
    const treatments = [
      { therapist_id: "me", duration: 60 },
      { therapist_id: "other", duration: 60 },
      { therapist_id: "me", duration: 30, is_addon: true },
    ];
    expect(myLegDuration("me", treatments, ["me", "other"], 2)).toBe(90);
    expect(myLegDuration("other", treatments, ["me", "other"], 2)).toBe(60);
  });

  it("combo-duo: one add-on per soin → each therapist carries their own", () => {
    const treatments = [
      { therapist_id: "me", duration: 60 },
      { therapist_id: "other", duration: 60 },
      { therapist_id: "me", duration: 30, is_addon: true },
      { therapist_id: "other", duration: 15, is_addon: true },
    ];
    expect(myLegDuration("me", treatments, ["me", "other"], 2)).toBe(90);
    expect(myLegDuration("other", treatments, ["me", "other"], 2)).toBe(75);
  });

  it("shared-duo: the add-on's carrier is paid for it, the other is not", () => {
    const treatments = [
      { therapist_id: "t1", duration: 60 },
      { therapist_id: "t1", duration: 30, is_addon: true },
    ];
    expect(myLegDuration("t1", treatments, ["t1", "t2"], 2)).toBe(90);
    expect(myLegDuration("t2", treatments, ["t1", "t2"], 2)).toBe(60);
  });

  it("solo: sums soins and add-ons alike", () => {
    const treatments = [
      { therapist_id: "me", duration: 60 },
      { therapist_id: null, duration: 45 },
      { therapist_id: "me", duration: 30, is_addon: true },
    ];
    expect(myLegDuration("me", treatments, ["me"], 1)).toBe(135);
  });

  it("old duo with add-ons but no stable link: positional on soins, add-ons unpaid", () => {
    const treatments = [
      { therapist_id: null, duration: 60 },
      { therapist_id: null, duration: 90 },
      { therapist_id: null, duration: 30, is_addon: true },
    ];
    expect(myLegDuration("t1", treatments, ["t1", "t2"], 2)).toBe(60);
    expect(myLegDuration("t2", treatments, ["t1", "t2"], 2)).toBe(90);
  });
});

describe("estimateTherapistShare", () => {
  const myRates = { rate_60: 30, rate_75: 45, rate_90: 60 };

  it("fixed-rate mode: rate × my leg duration", () => {
    expect(
      estimateTherapistShare({
        globalTherapistCommission: false,
        guestCount: 2,
        legDuration: 60,
        myRates,
        grossPrice: 200,
        therapistCommissionPercent: null,
        surchargePercent: 0,
      }),
    ).toBe(30);
  });

  it("fixed-rate mode: applies out-of-hours surcharge", () => {
    expect(
      estimateTherapistShare({
        globalTherapistCommission: false,
        guestCount: 1,
        legDuration: 90,
        myRates,
        grossPrice: 200,
        therapistCommissionPercent: null,
        surchargePercent: 20,
      }),
    ).toBe(72);
  });

  it("commission mode: percent of the therapist's share of the total", () => {
    // grossPrice 200 / 2 guests = 100, × 70% = 70
    expect(
      estimateTherapistShare({
        globalTherapistCommission: true,
        guestCount: 2,
        legDuration: 60,
        myRates,
        grossPrice: 200,
        therapistCommissionPercent: 70,
        surchargePercent: 0,
      }),
    ).toBe(70);
  });

  it("fixed-rate mode returns 0 when rates are missing", () => {
    expect(
      estimateTherapistShare({
        globalTherapistCommission: false,
        guestCount: 1,
        legDuration: 60,
        myRates: null,
        grossPrice: 200,
        therapistCommissionPercent: null,
        surchargePercent: 0,
      }),
    ).toBe(0);
  });
});
