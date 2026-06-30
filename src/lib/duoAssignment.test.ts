import { describe, it, expect } from "vitest";
import { assignLegsToTherapists } from "./duoAssignment";

describe("assignLegsToTherapists", () => {
  it("gives the longest leg to the first therapist (different durations)", () => {
    // legs in insertion order: [60, 90]; therapists [A, B]
    // A is served first -> longest (90, index 1); B -> 60 (index 0)
    expect(assignLegsToTherapists([{ duration: 60 }, { duration: 90 }], ["A", "B"])).toEqual([
      "B",
      "A",
    ]);
  });

  it("is stable for identical durations (keeps insertion order)", () => {
    expect(assignLegsToTherapists([{ duration: 60 }, { duration: 60 }], ["A", "B"])).toEqual([
      "A",
      "B",
    ]);
  });

  it("leaves extra legs unassigned when fewer therapists than legs", () => {
    expect(assignLegsToTherapists([{ duration: 90 }, { duration: 60 }], ["A"])).toEqual([
      "A",
      null,
    ]);
  });

  it("returns all null when no therapists (broadcast)", () => {
    expect(assignLegsToTherapists([{ duration: 90 }, { duration: 60 }], [])).toEqual([null, null]);
  });

  it("handles 3 legs, longest-first across the board", () => {
    // durations [45, 90, 60] -> ranks: 90(idx1)->A, 60(idx2)->B, 45(idx0)->C
    expect(
      assignLegsToTherapists([{ duration: 45 }, { duration: 90 }, { duration: 60 }], ["A", "B", "C"]),
    ).toEqual(["C", "A", "B"]);
  });
});
