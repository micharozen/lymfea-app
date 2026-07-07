import { describe, it, expect } from "vitest";
import { computeDuoLegs } from "./duoLegs";

describe("computeDuoLegs", () => {
  it("combo-duo: one soin per guest → each therapist on their own soin duration", () => {
    const legs = computeDuoLegs(
      ["t1", "t2"],
      [{ duration: 60 }, { duration: 90 }],
      2,
    );
    expect(legs).toEqual([
      { therapistId: "t1", duration: 60, index: 0 },
      { therapistId: "t2", duration: 90, index: 1 },
    ]);
  });

  it("shared-duo: single soin done in parallel → both therapists on that soin's duration", () => {
    const legs = computeDuoLegs(["t1", "t2"], [{ duration: 60 }], 2);
    expect(legs.map((l) => l.duration)).toEqual([60, 60]);
  });

  it("returns [] when there are no therapists", () => {
    expect(computeDuoLegs([], [{ duration: 60 }], 2)).toEqual([]);
  });
});
