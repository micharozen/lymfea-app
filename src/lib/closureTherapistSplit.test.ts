import { describe, it, expect } from "vitest";
import { splitBookingByTherapist, orderRoster, type SplitBookingInput } from "./closureTherapistSplit";

const base: SplitBookingInput = {
  lines: [],
  orderedTherapistIds: [],
  guestCount: 1,
  primaryTherapistId: null,
  totalPrice: 0,
  bookingDuration: 0,
};

const sumRevenue = (parts: { revenue: number }[]) =>
  Math.round(parts.reduce((s, p) => s + p.revenue, 0) * 100) / 100;

describe("splitBookingByTherapist", () => {
  it("solo: une part unique portant la durée et le prix entiers", () => {
    const parts = splitBookingByTherapist({
      ...base,
      lines: [{ therapist_id: null, duration: 60, price: 165 }],
      orderedTherapistIds: ["t1"],
      guestCount: 1,
      primaryTherapistId: "t1",
      totalPrice: 165,
      bookingDuration: 60,
    });
    expect(parts).toEqual([{ therapistId: "t1", duration: 60, revenue: 165 }]);
  });

  it("réservation sans thérapeute: une part « Non assigné »", () => {
    const parts = splitBookingByTherapist({ ...base, totalPrice: 90, bookingDuration: 60 });
    expect(parts).toEqual([{ therapistId: null, duration: 60, revenue: 90 }]);
  });

  it("combo-duo lié (cas #1575): chaque thérapeute reçoit son propre soin", () => {
    const parts = splitBookingByTherapist({
      ...base,
      lines: [
        { therapist_id: "marie", duration: 75, price: 190 },
        { therapist_id: "anais", duration: 75, price: 190 },
      ],
      orderedTherapistIds: ["marie", "anais"],
      guestCount: 2,
      primaryTherapistId: "marie",
      totalPrice: 380,
      bookingDuration: 75,
    });
    expect(parts).toEqual([
      { therapistId: "marie", duration: 75, revenue: 190 },
      { therapistId: "anais", duration: 75, revenue: 190 },
    ]);
  });

  it("combo-duo asymétrique: la répartition suit le prix de chaque soin", () => {
    const parts = splitBookingByTherapist({
      ...base,
      lines: [
        { therapist_id: "t1", duration: 90, price: 220 },
        { therapist_id: "t2", duration: 60, price: 160 },
      ],
      orderedTherapistIds: ["t1", "t2"],
      guestCount: 2,
      primaryTherapistId: "t1",
      totalPrice: 380,
      bookingDuration: 90,
    });
    expect(parts).toEqual([
      { therapistId: "t1", duration: 90, revenue: 220 },
      { therapistId: "t2", duration: 60, revenue: 160 },
    ]);
  });

  it("duo partagé (un seul soin à deux): partage 50/50", () => {
    const parts = splitBookingByTherapist({
      ...base,
      lines: [{ therapist_id: null, duration: 60, price: 380 }],
      orderedTherapistIds: ["t1", "t2"],
      guestCount: 2,
      primaryTherapistId: "t1",
      totalPrice: 380,
      bookingDuration: 60,
    });
    expect(parts.map((p) => p.revenue)).toEqual([190, 190]);
    expect(parts.map((p) => p.duration)).toEqual([60, 60]);
  });

  it("duo sans lien explicite: repli positionnel sur l'ordre du roster", () => {
    const parts = splitBookingByTherapist({
      ...base,
      lines: [
        { therapist_id: null, duration: 60, price: 160 },
        { therapist_id: null, duration: 90, price: 220 },
      ],
      orderedTherapistIds: ["t1", "t2"],
      guestCount: 2,
      primaryTherapistId: "t1",
      totalPrice: 380,
      bookingDuration: 90,
    });
    expect(parts).toEqual([
      { therapistId: "t1", duration: 60, revenue: 160 },
      { therapistId: "t2", duration: 90, revenue: 220 },
    ]);
  });

  it("duo legacy sans roster: tout revient au thérapeute principal", () => {
    const parts = splitBookingByTherapist({
      ...base,
      lines: [{ therapist_id: null, duration: 75, price: 380 }],
      orderedTherapistIds: [],
      guestCount: 2,
      primaryTherapistId: "marie",
      totalPrice: 380,
      bookingDuration: 75,
    });
    expect(parts).toEqual([{ therapistId: "marie", duration: 75, revenue: 380 }]);
  });

  it("remise: les parts sont renormalisées sur le prix réellement facturé", () => {
    const parts = splitBookingByTherapist({
      ...base,
      lines: [
        { therapist_id: "t1", duration: 60, price: 200 },
        { therapist_id: "t2", duration: 60, price: 200 },
      ],
      orderedTherapistIds: ["t1", "t2"],
      guestCount: 2,
      primaryTherapistId: "t1",
      totalPrice: 380,
      bookingDuration: 60,
    });
    expect(sumRevenue(parts)).toBe(380);
    expect(parts.map((p) => p.revenue)).toEqual([190, 190]);
  });

  it("arrondi: le résidu est versé sur la part la plus élevée", () => {
    const parts = splitBookingByTherapist({
      ...base,
      lines: [
        { therapist_id: "t1", duration: 60, price: 200 },
        { therapist_id: "t2", duration: 60, price: 100 },
      ],
      orderedTherapistIds: ["t1", "t2"],
      guestCount: 2,
      primaryTherapistId: "t1",
      totalPrice: 100.01,
      bookingDuration: 60,
    });
    expect(sumRevenue(parts)).toBe(100.01);
  });

  it("prix de ligne tous nuls: partage égal du total", () => {
    const parts = splitBookingByTherapist({
      ...base,
      lines: [
        { therapist_id: "t1", duration: 60, price: 0 },
        { therapist_id: "t2", duration: 60, price: 0 },
      ],
      orderedTherapistIds: ["t1", "t2"],
      guestCount: 2,
      primaryTherapistId: "t1",
      totalPrice: 300,
      bookingDuration: 60,
    });
    expect(parts.map((p) => p.revenue)).toEqual([150, 150]);
  });

  it("add-on: il suit le thérapeute qui le porte", () => {
    const parts = splitBookingByTherapist({
      ...base,
      lines: [
        { therapist_id: "t1", duration: 60, price: 160 },
        { therapist_id: "t2", duration: 60, price: 160 },
        { therapist_id: "t2", duration: 15, price: 40, is_addon: true },
      ],
      orderedTherapistIds: ["t1", "t2"],
      guestCount: 2,
      primaryTherapistId: "t1",
      totalPrice: 360,
      bookingDuration: 75,
    });
    expect(parts).toEqual([
      { therapistId: "t1", duration: 60, revenue: 160 },
      { therapistId: "t2", duration: 75, revenue: 200 },
    ]);
  });
});

describe("orderRoster", () => {
  it("trie par assigned_at", () => {
    expect(
      orderRoster([
        { therapist_id: "b", assigned_at: "2026-08-27T10:00:00Z" },
        { therapist_id: "a", assigned_at: "2026-08-27T09:00:00Z" },
      ]),
    ).toEqual(["a", "b"]);
  });

  it("assigned_at NULL: départage stable sur l'id plutôt que l'ordre d'arrivée", () => {
    expect(
      orderRoster([
        { therapist_id: "zoe", assigned_at: null },
        { therapist_id: "amel", assigned_at: null },
      ]),
    ).toEqual(["amel", "zoe"]);
  });
});
