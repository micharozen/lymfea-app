import { describe, it, expect } from "vitest";
import {
  getCartLineDisplayName,
  getCartLineUnitPrice,
  getCartLineTotalPrice,
  mapCartDetailToTreatmentLine,
  type TreatmentWithVariants,
} from "./bookingCartLine";

const massageMenu: TreatmentWithVariants = {
  id: "menu-1",
  name: "Massage relaxant",
  price: 80,
  duration: 60,
  treatment_variants: [
    { id: "v-solo", label: "Solo", price: 80, duration: 60, guest_count: 1 },
    { id: "v-duo", label: "Duo", price: 140, duration: 90, guest_count: 2 },
  ],
};

const menuNoVariants: TreatmentWithVariants = {
  id: "menu-2",
  name: "Soin simple",
  price: 50,
  duration: 45,
};

describe("bookingCartLine", () => {
  it("appends variant label to display name", () => {
    expect(getCartLineDisplayName(massageMenu, "v-solo")).toBe("Massage relaxant · Solo");
    expect(getCartLineDisplayName(massageMenu, "v-duo")).toBe("Massage relaxant · Duo");
  });

  it("uses menu name when no variant label", () => {
    expect(getCartLineDisplayName(menuNoVariants, null)).toBe("Soin simple");
    expect(getCartLineDisplayName(massageMenu, null)).toBe("Massage relaxant");
  });

  it("uses variant unit price when variantId is set", () => {
    expect(getCartLineUnitPrice(massageMenu, "v-solo")).toBe(80);
    expect(getCartLineUnitPrice(massageMenu, "v-duo")).toBe(140);
  });

  it("falls back to menu price without variant", () => {
    expect(getCartLineUnitPrice(menuNoVariants, null)).toBe(50);
    expect(getCartLineUnitPrice(massageMenu, null)).toBe(80);
  });

  it("multiplies unit price by quantity for line total", () => {
    expect(
      getCartLineTotalPrice({
        treatmentId: "menu-1",
        variantId: "v-duo",
        quantity: 2,
        treatment: massageMenu,
      }),
    ).toBe(280);
  });

  it("maps cart detail to notification treatment line", () => {
    expect(
      mapCartDetailToTreatmentLine({
        treatmentId: "menu-1",
        variantId: "v-solo",
        quantity: 1,
        treatment: massageMenu,
      }),
    ).toEqual({ name: "Massage relaxant · Solo", price: 80 });
  });
});
