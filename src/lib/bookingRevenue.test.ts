import { describe, it, expect } from "vitest";
import {
  bookingBilledAmount,
  countsAsRevenue,
  isBilledNoShow,
  isNoShowStatus,
  noShowFeeFrom,
} from "./bookingRevenue";

describe("isNoShowStatus", () => {
  it("reconnaît les deux orthographes en base", () => {
    expect(isNoShowStatus("noshow")).toBe(true);
    expect(isNoShowStatus("no_show")).toBe(true);
    expect(isNoShowStatus("completed")).toBe(false);
    expect(isNoShowStatus(null)).toBe(false);
  });
});

describe("isBilledNoShow", () => {
  it("retient les no-show réglés, facturés en chambre ou offerts", () => {
    for (const payment_status of ["paid", "charged_to_room", "offert"]) {
      expect(isBilledNoShow({ status: "noshow", payment_status, total_price: 100 })).toBe(true);
    }
  });

  it("écarte un no-show resté en attente de paiement", () => {
    expect(
      isBilledNoShow({ status: "noshow", payment_status: "pending", total_price: 170 }),
    ).toBe(false);
  });

  it("retient un no-show dont l'empreinte a été capturée", () => {
    expect(
      isBilledNoShow({
        status: "no_show",
        payment_status: "pending",
        total_price: 0,
        cancellation_fee_amount: 115,
      }),
    ).toBe(true);
  });

  it("ne dit rien des autres statuts", () => {
    expect(isBilledNoShow({ status: "cancelled", payment_status: "paid" })).toBe(false);
    expect(isBilledNoShow({ status: "completed", payment_status: "paid" })).toBe(false);
  });
});

describe("countsAsRevenue", () => {
  it("compte les prestations réalisées et les no-show facturés", () => {
    expect(countsAsRevenue({ status: "completed", payment_status: "pending" })).toBe(true);
    expect(countsAsRevenue({ status: "noshow", payment_status: "charged_to_room" })).toBe(true);
  });

  it("ne compte ni les annulations, ni l'attente, ni un no-show non facturé", () => {
    expect(countsAsRevenue({ status: "cancelled", payment_status: "paid" })).toBe(false);
    expect(countsAsRevenue({ status: "confirmed", payment_status: "paid" })).toBe(false);
    expect(countsAsRevenue({ status: "noshow", payment_status: "pending" })).toBe(false);
  });
});

describe("bookingBilledAmount", () => {
  it("rend le prix de la réservation hors no-show", () => {
    expect(bookingBilledAmount({ status: "completed", total_price: 120 })).toBe(120);
    // Des frais d'annulation ne déplacent pas le prix d'une prestation réalisée.
    expect(
      bookingBilledAmount({ status: "completed", total_price: 120, cancellation_fee_amount: 50 }),
    ).toBe(120);
  });

  it("préfère les frais capturés sur un no-show", () => {
    expect(
      bookingBilledAmount({ status: "noshow", total_price: 0, cancellation_fee_amount: 115 }),
    ).toBe(115);
  });

  it("retombe sur le prix quand aucun frais n'a été retenu", () => {
    expect(
      bookingBilledAmount({ status: "noshow", total_price: 480, cancellation_fee_amount: 0 }),
    ).toBe(480);
  });

  it("traite un prix absent comme nul", () => {
    expect(bookingBilledAmount({ status: "completed", total_price: null })).toBe(0);
  });
});

describe("noShowFeeFrom", () => {
  it("accepte l'objet comme le tableau renvoyés par PostgREST", () => {
    expect(noShowFeeFrom({ cancellation_fee_amount: 115 })).toBe(115);
    expect(noShowFeeFrom([{ cancellation_fee_amount: 115 }])).toBe(115);
    expect(noShowFeeFrom([])).toBe(null);
    expect(noShowFeeFrom(null)).toBe(null);
    expect(noShowFeeFrom(undefined)).toBe(null);
  });
});
