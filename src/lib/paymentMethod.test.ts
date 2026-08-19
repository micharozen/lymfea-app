import { describe, it, expect } from "vitest";
import {
  EIA_VENUE_ID,
  MANUAL_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_FILTER_OPTIONS,
  PAYMENT_METHOD_UNSET,
  manualPaymentMethodsForVenue,
  paymentMethodLabel,
} from "./paymentMethod";

describe("MANUAL_PAYMENT_METHODS", () => {
  // `bundle` est posé par la consommation d'un forfait : une saisie manuelle
  // décorrélerait la réservation de la séance décomptée.
  it("excludes system-written methods", () => {
    expect(MANUAL_PAYMENT_METHODS).not.toContain("bundle");
  });

  it("offers the online payment and the on-site card separately", () => {
    expect(MANUAL_PAYMENT_METHODS).toContain("card");
    expect(MANUAL_PAYMENT_METHODS).toContain("card_on_site");
  });

  it("only lists known methods", () => {
    for (const method of MANUAL_PAYMENT_METHODS) {
      expect(PAYMENT_METHOD_LABELS[method]).toBeDefined();
    }
  });
});

describe("manualPaymentMethodsForVenue", () => {
  it("reserves cure_fresha for the EÏA venue", () => {
    expect(manualPaymentMethodsForVenue(EIA_VENUE_ID)).toContain("cure_fresha");
  });

  it("omits cure_fresha for any other venue", () => {
    expect(manualPaymentMethodsForVenue("7a33f87a-5751-41ac-998d-0596d9eeda08")).not.toContain(
      "cure_fresha",
    );
    expect(manualPaymentMethodsForVenue(null)).not.toContain("cure_fresha");
  });

  it("keeps the shared methods first", () => {
    expect(manualPaymentMethodsForVenue(EIA_VENUE_ID).slice(0, MANUAL_PAYMENT_METHODS.length)).toEqual([
      ...MANUAL_PAYMENT_METHODS,
    ]);
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

  it("distinguishes an online payment from an on-site card", () => {
    expect(paymentMethodLabel("card")).toBe("Paiement en ligne");
    expect(paymentMethodLabel("card_on_site")).toBe("CB sur place");
  });

  it("falls back to the raw value for an unknown method", () => {
    expect(paymentMethodLabel("crypto")).toBe("crypto");
  });
});
