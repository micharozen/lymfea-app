import { describe, expect, it } from "vitest";
import { pickFirstAvailableDate } from "@shared/pickAvailableDate";

type Slots = Map<string, { time: string; outOfHours: boolean; capacity: number }[]>;

const slot = { time: "10:00:00", outOfHours: false, capacity: 1 };

describe("pickFirstAvailableDate", () => {
  it("retient la première date quand elle est disponible", () => {
    const slots: Slots = new Map([
      ["2026-09-21", [slot]],
      ["2026-09-22", [slot]],
    ]);
    const result = pickFirstAvailableDate(
      ["2026-09-21", "2026-09-22"],
      slots,
      new Set(["2026-09-21", "2026-09-22"]),
    );
    expect(result.date).toBe("2026-09-21");
    expect(result.rejected).toEqual([]);
    expect(result.hadAlternatives).toBe(true);
  });

  it("se replie sur la seconde quand la première est complète", () => {
    const slots: Slots = new Map([
      ["2026-09-21", []],
      ["2026-09-22", [slot]],
    ]);
    const result = pickFirstAvailableDate(
      ["2026-09-21", "2026-09-22"],
      slots,
      new Set(["2026-09-21", "2026-09-22"]),
    );
    expect(result.date).toBe("2026-09-22");
    expect(result.rejected).toEqual([{ date: "2026-09-21", reason: "no_slot" }]);
  });

  it("écarte une date où le lieu n'est pas déployé", () => {
    const slots: Slots = new Map([["2026-09-22", [slot]]]);
    const result = pickFirstAvailableDate(
      ["2026-09-21", "2026-09-22"],
      slots,
      new Set(["2026-09-22"]),
    );
    expect(result.date).toBe("2026-09-22");
    expect(result.rejected).toEqual([{ date: "2026-09-21", reason: "not_deployed" }]);
  });

  it("ne retient aucune date quand toutes sont impossibles", () => {
    const slots: Slots = new Map([
      ["2026-09-21", []],
      ["2026-09-22", []],
    ]);
    const result = pickFirstAvailableDate(
      ["2026-09-21", "2026-09-22"],
      slots,
      new Set(["2026-09-21", "2026-09-22"]),
    );
    expect(result.date).toBeNull();
    expect(result.rejected).toHaveLength(2);
  });

  it("respecte l'ordre de préférence, pas l'ordre chronologique", () => {
    // Le client a dit « mardi, ou lundi à défaut » : mardi passe en premier.
    const slots: Slots = new Map([
      ["2026-09-21", [slot]],
      ["2026-09-22", [slot]],
    ]);
    const result = pickFirstAvailableDate(
      ["2026-09-22", "2026-09-21"],
      slots,
      new Set(["2026-09-21", "2026-09-22"]),
    );
    expect(result.date).toBe("2026-09-22");
  });

  it("signale l'absence d'alternative sur une date unique", () => {
    const result = pickFirstAvailableDate(["2026-09-21"], new Map([["2026-09-21", [slot]]]), new Set(["2026-09-21"]));
    expect(result.hadAlternatives).toBe(false);
  });
});
