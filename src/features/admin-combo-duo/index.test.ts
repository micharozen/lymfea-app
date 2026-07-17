import { describe, it, expect } from "vitest";
import {
  expandCartToSessions,
  buildComboDuoBookingParams,
  isComboDuoEligible,
  getBaseSessionCount,
  computeStaffingCount,
} from "./index";

const treatment = (
  id: string,
  duration: number,
  opts: { is_addon?: boolean; guest_count?: number; amenity_id?: string } = {},
) => ({
  id,
  name: id,
  duration,
  is_addon: opts.is_addon ?? false,
  amenity_id: opts.amenity_id ?? null,
  treatment_variants: opts.guest_count
    ? [{ id: `${id}-v`, duration, guest_count: opts.guest_count, is_default: true }]
    : [],
});

const cartLine = (t: ReturnType<typeof treatment>, quantity = 1, variantId: string | null = null) => ({
  treatmentId: t.id,
  quantity,
  variantId,
  treatment: t,
});

describe("expandCartToSessions", () => {
  it("marks add-on sessions from the treatment's is_addon flag", () => {
    const base = treatment("massage", 90);
    const addon = treatment("extremites", 15, { is_addon: true });
    const sessions = expandCartToSessions([cartLine(base), cartLine(addon)]);
    expect(sessions.map((s) => ({ id: s.treatmentId, addon: s.isAddon }))).toEqual([
      { id: "massage", addon: false },
      { id: "extremites", addon: true },
    ]);
  });
});

describe("getBaseSessionCount", () => {
  it("counts only base soins, ignoring add-ons", () => {
    const sessions = expandCartToSessions([
      cartLine(treatment("massage", 90), 2),
      cartLine(treatment("extremites", 15, { is_addon: true }), 2),
    ]);
    expect(getBaseSessionCount(sessions)).toBe(2);
  });

  it("ignores amenity accesses: they need no therapist", () => {
    const sessions = expandCartToSessions([
      cartLine(treatment("massage", 90)),
      cartLine(treatment("piscine", 60, { amenity_id: "pool" })),
    ]);
    expect(getBaseSessionCount(sessions)).toBe(1);
  });
});

describe("isComboDuoEligible", () => {
  it("is true for 2 base solo soins + add-ons", () => {
    const sessions = expandCartToSessions([
      cartLine(treatment("massage", 90), 2),
      cartLine(treatment("extremites", 15, { is_addon: true }), 2),
    ]);
    expect(isComboDuoEligible(sessions)).toBe(true);
  });

  it("is false for a single base + an add-on (that is a solo + add-on, not a duo)", () => {
    const sessions = expandCartToSessions([
      cartLine(treatment("massage", 90)),
      cartLine(treatment("extremites", 15, { is_addon: true })),
    ]);
    expect(isComboDuoEligible(sessions)).toBe(false);
  });

  it("is false for a single soin + an amenity access (still one guest)", () => {
    const sessions = expandCartToSessions([
      cartLine(treatment("massage", 90)),
      cartLine(treatment("piscine", 60, { amenity_id: "pool" })),
    ]);
    expect(isComboDuoEligible(sessions)).toBe(false);
  });

  it("is false when a base soin is already a variant-duo (guest_count > 1)", () => {
    const duo = treatment("massage", 90, { guest_count: 2 });
    const sessions = expandCartToSessions([cartLine(duo, 1, "massage-v"), cartLine(treatment("facial", 60))]);
    expect(isComboDuoEligible(sessions)).toBe(false);
  });
});

describe("computeStaffingCount", () => {
  it("combo-duo staffs one practitioner per base soin, not per add-on", () => {
    expect(computeStaffingCount(true, /* baseSessionCount */ 2, /* requiredGuestCount */ 1)).toBe(2);
  });

  it("falls back to requiredGuestCount when combo-duo is off", () => {
    expect(computeStaffingCount(false, 2, 3)).toBe(3);
  });
});

describe("buildComboDuoBookingParams", () => {
  it("booking #669: 2 base (90) + 2 add-ons (15) → guest 2, duration 105", () => {
    const sessions = expandCartToSessions([
      cartLine(treatment("massage", 90), 2),
      cartLine(treatment("extremites", 15, { is_addon: true }), 2),
    ]);
    const params = buildComboDuoBookingParams(sessions);
    expect(params.guestCount).toBe(2);
    expect(params.duration).toBe(105);

    const bases = params.treatments.filter((t) => !t.isAddon);
    const addons = params.treatments.filter((t) => t.isAddon);
    expect(bases.map((t) => t.legIndex)).toEqual([0, 1]);
    // one add-on per person (round-robin), each pointing at its person's base
    expect(addons.map((t) => t.legIndex)).toEqual([0, 1]);
    expect(addons.every((t) => t.parentTreatmentId === "massage")).toBe(true);
  });

  it("distributes add-ons round-robin across bases (2 base + 3 add-ons)", () => {
    const sessions = expandCartToSessions([
      cartLine(treatment("massage", 90), 2),
      cartLine(treatment("extremites", 15, { is_addon: true }), 3),
    ]);
    const params = buildComboDuoBookingParams(sessions);
    // leg0 = 90+15+15 = 120, leg1 = 90+15 = 105 → longest leg wins
    expect(params.guestCount).toBe(2);
    expect(params.duration).toBe(120);
  });

  it("keeps an amenity line in the booking but out of the legs and the duration", () => {
    const sessions = expandCartToSessions([
      cartLine(treatment("massage", 90), 2),
      cartLine(treatment("piscine", 120, { amenity_id: "pool" })),
    ]);
    const params = buildComboDuoBookingParams(sessions);
    // 2 guests, not 3 — and the 120min pool access never inflates the soin slot
    expect(params.guestCount).toBe(2);
    expect(params.duration).toBe(90);

    const amenity = params.treatments.find((t) => t.isAmenity);
    expect(amenity?.treatmentId).toBe("piscine");
    // no leg → no therapist assigned at insert time
    expect(amenity?.legIndex).toBeUndefined();
  });

  it("no add-on: unchanged behaviour (max of the base soins)", () => {
    const sessions = expandCartToSessions([
      cartLine(treatment("massage", 90)),
      cartLine(treatment("facial", 60)),
    ]);
    const params = buildComboDuoBookingParams(sessions);
    expect(params.guestCount).toBe(2);
    expect(params.duration).toBe(90);
  });
});
