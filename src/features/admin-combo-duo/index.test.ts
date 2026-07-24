import { describe, it, expect } from "vitest";
import {
  buildLegs,
  buildComboDuoBookingParams,
  computeStaffingCount,
  defaultLegAssignments,
  isValidPartition,
  type AdminBookingSession,
} from "./index";

function base(id: string, duration: number, price: number): AdminBookingSession {
  return {
    sessionKey: `${id}-${duration}`,
    treatmentId: id,
    variantId: null,
    label: id,
    duration,
    guestCount: 1,
    unitPrice: price,
    isAddon: false,
    isAmenity: false,
  };
}

function addon(id: string, duration: number, price: number): AdminBookingSession {
  return { ...base(id, duration, price), isAddon: true };
}

function amenity(id: string): AdminBookingSession {
  return { ...base(id, 30, 0), isAmenity: true };
}

describe("defaultLegAssignments", () => {
  it("is the identity when one practitioner per soin", () => {
    expect(defaultLegAssignments(4, 4)).toEqual([0, 1, 2, 3]);
  });
  it("round-robins when fewer practitioners than soins", () => {
    expect(defaultLegAssignments(4, 2)).toEqual([0, 1, 0, 1]);
  });
});

describe("isValidPartition", () => {
  it("accepts a partition where every practitioner has a soin", () => {
    expect(isValidPartition([0, 1, 0, 1], 2)).toBe(true);
  });
  it("rejects a partition leaving a practitioner empty", () => {
    expect(isValidPartition([0, 0, 0, 0], 2)).toBe(false);
  });
});

describe("buildLegs", () => {
  it("splits 4 soins into 2 legs, summing durations and prices per leg", () => {
    const sessions = [base("A", 30, 50), base("B", 45, 60), base("C", 30, 50), base("D", 60, 70)];
    const legs = buildLegs(sessions, [0, 1, 0, 1]);
    expect(legs).toHaveLength(2);
    // leg 0 = A + C, leg 1 = B + D
    expect(legs[0].durationSum).toBe(60);
    expect(legs[0].priceSum).toBe(100);
    expect(legs[1].durationSum).toBe(105);
    expect(legs[1].priceSum).toBe(130);
    expect(legs[0].treatmentLines.map((l) => l.treatmentId)).toEqual(["A", "C"]);
  });

  it("defaults to one base per leg with no assignments (historical behaviour)", () => {
    const sessions = [base("A", 30, 50), base("B", 45, 60)];
    const legs = buildLegs(sessions);
    expect(legs).toHaveLength(2);
    expect(legs[0].durationSum).toBe(30);
    expect(legs[1].durationSum).toBe(45);
  });

  it("attaches add-ons round-robin and excludes amenities from legs", () => {
    const sessions = [base("A", 30, 50), base("B", 30, 50), addon("X", 15, 10), amenity("POOL")];
    const legs = buildLegs(sessions, [0, 1]);
    // add-on X goes to leg 0 (j=0 % 2)
    expect(legs[0].durationSum).toBe(45);
    expect(legs[0].treatmentLines.some((l) => l.treatmentId === "X" && l.isAddon)).toBe(true);
    expect(legs.flatMap((l) => l.treatmentLines).some((l) => l.treatmentId === "POOL")).toBe(false);
  });
});

describe("buildComboDuoBookingParams", () => {
  it("2 legs → guestCount 2, duration = max leg, amenity line kept", () => {
    const sessions = [base("A", 30, 50), base("B", 45, 60), base("C", 30, 50), base("D", 60, 70), amenity("POOL")];
    const params = buildComboDuoBookingParams(sessions, [0, 1, 0, 1]);
    expect(params.guestCount).toBe(2);
    expect(params.duration).toBe(105); // max(60, 105)
    expect(params.treatments.some((t) => t.isAmenity && t.treatmentId === "POOL")).toBe(true);
  });

  it("no assignments → one leg per soin (non-regression)", () => {
    const sessions = [base("A", 30, 50), base("B", 45, 60)];
    const params = buildComboDuoBookingParams(sessions);
    expect(params.guestCount).toBe(2);
    expect(params.duration).toBe(45);
  });
});

describe("computeStaffingCount", () => {
  it("returns the chosen practitioner count when combo enabled", () => {
    expect(computeStaffingCount(true, 2, 1)).toBe(2);
  });
  it("returns requiredGuestCount when combo disabled", () => {
    expect(computeStaffingCount(false, 2, 3)).toBe(3);
  });
});
