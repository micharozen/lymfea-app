import { describe, it, expect } from "vitest";
import { matchesBookingFilters, type BookingFilterValues } from "./useBookingFilters";
import { PAYMENT_METHOD_UNSET } from "@/lib/paymentMethod";
import type { BookingWithTreatments } from "./useBookingData";

const NO_FILTERS: BookingFilterValues = {
  searchQuery: "",
  status: [],
  hotel: [],
  therapist: [],
  paymentMethod: [],
  paymentStatus: [],
};

const booking = (overrides: Partial<BookingWithTreatments> = {}) =>
  ({
    client_first_name: "Marie",
    client_last_name: "Dupont",
    phone: "+33612345678",
    status: "confirmed",
    hotel_id: "hotel-a",
    therapist_id: "th-1",
    payment_method: "card",
    payment_status: "paid",
    ...overrides,
  }) as BookingWithTreatments;

describe("matchesBookingFilters", () => {
  it("keeps everything when no filter is set", () => {
    expect(matchesBookingFilters(booking(), NO_FILTERS)).toBe(true);
    expect(
      matchesBookingFilters(booking({ payment_method: null, status: "cancelled" }), NO_FILTERS)
    ).toBe(true);
  });

  it("accepts any value of a multi-selection", () => {
    const filters = { ...NO_FILTERS, status: ["confirmed", "completed"] };
    expect(matchesBookingFilters(booking({ status: "confirmed" }), filters)).toBe(true);
    expect(matchesBookingFilters(booking({ status: "completed" }), filters)).toBe(true);
    expect(matchesBookingFilters(booking({ status: "cancelled" }), filters)).toBe(false);
  });

  it("combines filters with AND", () => {
    const filters = { ...NO_FILTERS, status: ["confirmed"], hotel: ["hotel-b"] };
    // Statut correct mais mauvais lieu : exclu.
    expect(matchesBookingFilters(booking({ status: "confirmed" }), filters)).toBe(false);
    expect(
      matchesBookingFilters(booking({ status: "confirmed", hotel_id: "hotel-b" }), filters)
    ).toBe(true);
  });

  it("separates Stripe from an on-site card", () => {
    const stripeOnly = { ...NO_FILTERS, paymentMethod: ["card"] };
    expect(matchesBookingFilters(booking({ payment_method: "card" }), stripeOnly)).toBe(true);
    expect(matchesBookingFilters(booking({ payment_method: "card_on_site" }), stripeOnly)).toBe(
      false
    );
  });

  it("targets bookings without a payment method through the unset sentinel", () => {
    const filters = { ...NO_FILTERS, paymentMethod: [PAYMENT_METHOD_UNSET] };
    expect(matchesBookingFilters(booking({ payment_method: null }), filters)).toBe(true);
    expect(matchesBookingFilters(booking({ payment_method: "cash" }), filters)).toBe(false);
  });

  it("combines the unset sentinel with real methods", () => {
    const filters = { ...NO_FILTERS, paymentMethod: [PAYMENT_METHOD_UNSET, "cash"] };
    expect(matchesBookingFilters(booking({ payment_method: null }), filters)).toBe(true);
    expect(matchesBookingFilters(booking({ payment_method: "cash" }), filters)).toBe(true);
    expect(matchesBookingFilters(booking({ payment_method: "card" }), filters)).toBe(false);
  });

  it("excludes a booking whose field is null when the filter is active", () => {
    const filters = { ...NO_FILTERS, therapist: ["th-1"] };
    expect(matchesBookingFilters(booking({ therapist_id: null }), filters)).toBe(false);
  });

  it("searches first name, last name and phone, case-insensitively", () => {
    expect(matchesBookingFilters(booking(), { ...NO_FILTERS, searchQuery: "mar" })).toBe(true);
    expect(matchesBookingFilters(booking(), { ...NO_FILTERS, searchQuery: "DUPONT" })).toBe(true);
    expect(matchesBookingFilters(booking(), { ...NO_FILTERS, searchQuery: "0612" })).toBe(false);
    expect(matchesBookingFilters(booking(), { ...NO_FILTERS, searchQuery: "612345" })).toBe(true);
    expect(matchesBookingFilters(booking(), { ...NO_FILTERS, searchQuery: "zzz" })).toBe(false);
  });
});
