import { describe, expect, it } from "vitest";
import { formatAmount, formatPrice, roundPrice } from "./formatPrice";

describe("roundPrice", () => {
  it("removes floating point noise at the price scale", () => {
    expect(roundPrice(12.345 * 3)).toBe(37.035);
  });

  it("caps the precision to 3 decimals", () => {
    expect(roundPrice(12.3456)).toBe(12.346);
  });
});

describe("formatAmount", () => {
  it("keeps integers clean by default", () => {
    expect(formatAmount(120)).toBe("120");
  });

  it("shows only the decimals the amount needs", () => {
    expect(formatAmount(120.5)).toBe("120.5");
    expect(formatAmount(12.345)).toBe("12.345");
  });

  it("honours the minimum number of decimals", () => {
    expect(formatAmount(120, 2)).toBe("120.00");
    expect(formatAmount(12.345, 2)).toBe("12.345");
  });
});

describe("formatPrice", () => {
  it("keeps the 2-decimal default for regular amounts", () => {
    expect(formatPrice(42, "EUR")).toBe("42.00 €");
    expect(formatPrice(42, "USD")).toBe("$ 42.00");
  });

  it("shows the third decimal when it is significant", () => {
    expect(formatPrice(12.345, "EUR")).toBe("12.345 €");
    expect(formatPrice(12.34, "EUR")).toBe("12.34 €");
  });

  it("adds decimals to compact displays only when needed", () => {
    expect(formatPrice(120, "EUR", { decimals: 0 })).toBe("120 €");
    expect(formatPrice(12.345, "EUR", { decimals: 0 })).toBe("12.345 €");
  });
});
