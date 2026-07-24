import { describe, expect, it } from "vitest";
import { formatTherapistShortName } from "./bookingColumns";

describe("formatTherapistShortName", () => {
  it("garde le prénom et abrège le nom de famille", () => {
    expect(formatTherapistShortName("Marie Dupont")).toBe("Marie D.");
  });

  it("traite les prénoms composés comme un seul prénom", () => {
    expect(formatTherapistShortName("Anne Marie Dupont")).toBe("Anne Marie D.");
  });

  it("laisse un prénom seul tel quel", () => {
    expect(formatTherapistShortName("Marie")).toBe("Marie");
  });

  it("met l'initiale en majuscule", () => {
    expect(formatTherapistShortName("marie dupont")).toBe("marie D.");
  });

  it("absorbe les espaces superflus", () => {
    expect(formatTherapistShortName("  Marie   Dupont  ")).toBe("Marie D.");
  });

  it("retourne null quand il n'y a pas de nom", () => {
    expect(formatTherapistShortName(null)).toBeNull();
    expect(formatTherapistShortName("")).toBeNull();
    expect(formatTherapistShortName("   ")).toBeNull();
  });
});
