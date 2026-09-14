import { describe, it, expect } from "vitest";
import { myLegDuration, bookingSlotDuration, estimateTherapistShare } from "./therapistLegDuration";

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

  // Issue #547 : un booking simple (guest_count = 1) enchaînant corps + visage
  // qu'aucun praticien ne réalise en entier se partage entre deux praticiens.
  it("booking simple partagé: chacun sur sa prestation malgré guestCount 1", () => {
    const treatments = [
      { therapist_id: "me", duration: 60 },
      { therapist_id: "other", duration: 30 },
    ];
    expect(myLegDuration("me", treatments, ["me", "other"], 1)).toBe(60);
    expect(myLegDuration("other", treatments, ["me", "other"], 1)).toBe(30);
  });

  it("booking simple partagé: la jambe encore libre n'est due à personne", () => {
    const treatments = [
      { therapist_id: "me", duration: 60 },
      { therapist_id: null, duration: 30 },
    ];
    expect(myLegDuration("me", treatments, ["me", "other"], 1)).toBe(60);
  });

  it("booking simple partagé: mes add-ons suivent ma prestation", () => {
    const treatments = [
      { therapist_id: "me", duration: 60 },
      { therapist_id: "other", duration: 30 },
      { therapist_id: "me", duration: 15, is_addon: true },
    ];
    expect(myLegDuration("me", treatments, ["me", "other"], 1)).toBe(75);
    expect(myLegDuration("other", treatments, ["me", "other"], 1)).toBe(30);
  });

  // Garde-fou de non-régression : jusqu'au partage, le claim d'un booking simple
  // ne prenait QUE la première ligne (LIMIT 1). Ces réservations existent en base
  // avec une jambe NULL et un seul praticien, qui doit rester payé sur tout.
  it("praticien seul avec claim partiel historique: payé sur toutes les prestations", () => {
    const treatments = [
      { therapist_id: "me", duration: 60 },
      { therapist_id: null, duration: 45 },
    ];
    expect(myLegDuration("me", treatments, ["me"], 1)).toBe(105);
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

describe("bookingSlotDuration", () => {
  it("solo: sums every treatment", () => {
    const treatments = [
      { therapist_id: null, duration: 60 },
      { therapist_id: null, duration: 30, is_addon: true },
    ];
    expect(bookingSlotDuration(treatments, 1)).toBe(90);
  });

  it("duo with stable link: the longest leg, not the sum (booking #963)", () => {
    const treatments = [
      { therapist_id: "marie", duration: 75 },
      { therapist_id: "florence", duration: 75 },
    ];
    expect(bookingSlotDuration(treatments, 2)).toBe(75);
  });

  it("duo with uneven legs: the longest one drives the slot", () => {
    const treatments = [
      { therapist_id: "t1", duration: 60 },
      { therapist_id: "t2", duration: 90 },
    ];
    expect(bookingSlotDuration(treatments, 2)).toBe(90);
  });

  it("combo-duo: add-ons extend the leg that carries them", () => {
    const treatments = [
      { therapist_id: "t1", duration: 90 },
      { therapist_id: "t2", duration: 90 },
      { therapist_id: "t1", duration: 15, is_addon: true },
    ];
    expect(bookingSlotDuration(treatments, 2)).toBe(105);
  });

  it("duo without stable link: parallel soins, longest one wins", () => {
    const treatments = [
      { therapist_id: null, duration: 60 },
      { therapist_id: null, duration: 75 },
    ];
    expect(bookingSlotDuration(treatments, 2)).toBe(75);
  });

  it("shared-duo: a single soin worked in parallel", () => {
    const treatments = [{ therapist_id: null, duration: 60 }];
    expect(bookingSlotDuration(treatments, 2)).toBe(60);
  });

  it("more soins than guests without a link: keeps the sum as a safe upper bound", () => {
    const treatments = [
      { therapist_id: null, duration: 60 },
      { therapist_id: null, duration: 30 },
      { therapist_id: null, duration: 45 },
    ];
    expect(bookingSlotDuration(treatments, 2)).toBe(135);
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

describe("estimateTherapistShare — mode commission", () => {
  const base = {
    globalTherapistCommission: true,
    legDuration: 45,
    myRates: null,
    grossPrice: 165,
    therapistCommissionPercent: 70,
    surchargePercent: 0,
  };

  it("duo sans jambe connue: partage par invité", () => {
    expect(estimateTherapistShare({ ...base, guestCount: 2 })).toBe(57.75);
  });

  // Issue #547 : un booking simple partagé n'a qu'un invité et deux praticiens.
  // Diviser le panier par guestCount donnerait 70 % du total à CHACUN.
  it("booking simple partagé: la commission porte sur mes seules prestations", () => {
    expect(estimateTherapistShare({ ...base, guestCount: 1, legGrossPrice: 75 })).toBe(52.5);
    expect(estimateTherapistShare({ ...base, guestCount: 1, legGrossPrice: 90 })).toBe(63);
  });
});
