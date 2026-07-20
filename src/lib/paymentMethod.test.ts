import { describe, it, expect } from "vitest";
import {
  MANUAL_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_FILTER_OPTIONS,
  PAYMENT_METHOD_UNSET,
  paymentMethodLabel,
} from "./paymentMethod";

describe("MANUAL_PAYMENT_METHODS", () => {
  // Invariant central du pointage Stripe : `card` ne doit jamais pouvoir être
  // saisi à la main, sinon une CB encaissée au comptoir devient indiscernable
  // d'un encaissement Stripe.
  it("excludes system-written methods", () => {
    expect(MANUAL_PAYMENT_METHODS).not.toContain("card");
    expect(MANUAL_PAYMENT_METHODS).not.toContain("bundle");
  });

  it("offers card_on_site for a card cashed in on the premises", () => {
    expect(MANUAL_PAYMENT_METHODS).toContain("card_on_site");
  });

  it("only lists known methods", () => {
    for (const method of MANUAL_PAYMENT_METHODS) {
      expect(PAYMENT_METHOD_LABELS[method]).toBeDefined();
    }
  });
});

describe("PAYMENT_METHOD_FILTER_OPTIONS", () => {
  it("covers every known method plus the unset bucket", () => {
    const values = PAYMENT_METHOD_FILTER_OPTIONS.map((o) => o.value);
    expect(values).toEqual([...Object.keys(PAYMENT_METHOD_LABELS), PAYMENT_METHOD_UNSET]);
  });
});

describe("paymentMethodLabel", () => {
  it("returns an empty string when no method is set", () => {
    expect(paymentMethodLabel(null)).toBe("");
    expect(paymentMethodLabel(undefined)).toBe("");
  });

  it("distinguishes Stripe from an on-site card", () => {
    expect(paymentMethodLabel("card")).toBe("Stripe (en ligne / lien)");
    expect(paymentMethodLabel("card_on_site")).toBe("CB sur place");
  });

  it("falls back to the raw value for an unknown method", () => {
    expect(paymentMethodLabel("crypto")).toBe("crypto");
  });
});
