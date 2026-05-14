import { describe, it, expect } from "vitest";
import {
  computeClosureStats,
  renderClosureReportHtml,
  type ClosureBooking,
  type ClosureVenue,
  type TherapistRatesMap,
} from "./closureReport";

const venue: ClosureVenue = {
  id: "v1",
  name: "Lieu Test",
  currency: "EUR",
  hotel_commission: 10,
  venue_type: "hotel",
};

const rates: TherapistRatesMap = {
  "ther-1": { rate_45: 30, rate_60: 40, rate_90: 60 },
  "ther-2": { rate_45: 25, rate_60: 35, rate_90: 50 },
  "ther-noRates": null,
};

function makeBooking(over: Partial<ClosureBooking> = {}): ClosureBooking {
  return {
    id: "b1",
    booking_id: 1001,
    booking_date: "2026-05-11",
    booking_time: "10:00:00",
    client_first_name: "Alice",
    client_last_name: "Martin",
    client_type: "external",
    room_number: null,
    therapist_id: "ther-1",
    therapist_name: "Thérapeute Un",
    duration: 60,
    total_price: 100,
    payment_method: "card",
    payment_status: "paid",
    status: "completed",
    treatments: [{ name: "Massage", category: "Massage", duration: 60 }],
    ...over,
  };
}

describe("computeClosureStats — status differentiation", () => {
  it("counts completed in revenue but not confirmed", () => {
    const bookings = [
      makeBooking({ id: "b1", status: "completed", total_price: 100 }),
      makeBooking({ id: "b2", status: "confirmed", total_price: 200 }),
    ];
    const stats = computeClosureStats(bookings, venue, rates);

    expect(stats.completedBookings).toBe(1);
    expect(stats.confirmedBookings).toBe(1);
    expect(stats.totalRevenue).toBe(100);
    expect(stats.totalBookings).toBe(2);
  });

  it("counts all non-revenue statuses separately and excludes them from revenue", () => {
    const bookings = [
      makeBooking({ id: "b1", status: "completed", total_price: 100 }),
      makeBooking({ id: "b2", status: "pending", total_price: 80 }),
      makeBooking({ id: "b3", status: "cancelled", total_price: 50 }),
      makeBooking({ id: "b4", status: "no_show", total_price: 60 }),
    ];
    const stats = computeClosureStats(bookings, venue, rates);

    expect(stats.completedBookings).toBe(1);
    expect(stats.pendingBookings).toBe(1);
    expect(stats.cancelledBookings).toBe(1);
    expect(stats.noShowBookings).toBe(1);
    expect(stats.totalRevenue).toBe(100);
  });
});

describe("computeClosureStats — therapist commissions", () => {
  it("uses therapist rates by therapist_id and duration", () => {
    // ther-1: rate_60=40 for 60min; venue 10%; price 100
    const stats = computeClosureStats([makeBooking({ duration: 60 })], venue, rates);
    expect(stats.totalRevenue).toBe(100);
    expect(stats.totalVenueShare).toBeCloseTo(10, 2);
    expect(stats.totalTherapistShare).toBeCloseTo(40, 2);
    expect(stats.totalPlatformShare).toBeCloseTo(50, 2);
  });

  it("uses rate_45 for short treatments (frontend bracket logic)", () => {
    const stats = computeClosureStats(
      [makeBooking({ duration: 30, therapist_id: "ther-1" })],
      venue,
      rates,
    );
    expect(stats.totalTherapistShare).toBe(30);
  });

  it("uses rate_90 for 90 min treatments", () => {
    const stats = computeClosureStats(
      [makeBooking({ duration: 90, therapist_id: "ther-1" })],
      venue,
      rates,
    );
    expect(stats.totalTherapistShare).toBe(60);
  });

  it("extrapolates beyond 90 minutes from rate_90", () => {
    const stats = computeClosureStats(
      [makeBooking({ duration: 120, therapist_id: "ther-1" })],
      venue,
      rates,
    );
    // rate_90=60, ratio 120/90 → 60 * (120/90) ≈ 80
    expect(stats.totalTherapistShare).toBeCloseTo(80, 2);
  });

  it("falls back to sum of treatments duration when booking.duration is null", () => {
    const stats = computeClosureStats(
      [
        makeBooking({
          duration: null,
          therapist_id: "ther-1",
          treatments: [
            { name: "A", category: "Massage", duration: 30 },
            { name: "B", category: "Massage", duration: 30 },
          ],
        }),
      ],
      venue,
      rates,
    );
    expect(stats.totalTherapistShare).toBe(40); // 60 total → rate_60
  });

  it("counts bookings without therapist rate and zero their part", () => {
    const stats = computeClosureStats(
      [
        makeBooking({ id: "b1", therapist_id: "ther-1" }),
        makeBooking({ id: "b2", therapist_id: "ther-noRates", therapist_name: "Sans tarif" }),
        makeBooking({ id: "b3", therapist_id: "ther-unknown", therapist_name: "Inconnu" }),
      ],
      venue,
      rates,
    );
    expect(stats.bookingsWithoutTherapistRate).toBe(2);
    expect(stats.totalTherapistShare).toBe(40); // only ther-1 contributed
  });

  it("does not flag missing rate when booking has no therapist_id", () => {
    const stats = computeClosureStats(
      [makeBooking({ therapist_id: null, therapist_name: null })],
      venue,
      rates,
    );
    expect(stats.bookingsWithoutTherapistRate).toBe(0);
    expect(stats.totalTherapistShare).toBe(0);
  });

  it("groups byTherapist with accumulated earnings and hasRates flag", () => {
    const stats = computeClosureStats(
      [
        makeBooking({ id: "b1", therapist_id: "ther-1", therapist_name: "T1", total_price: 100, duration: 60 }),
        makeBooking({ id: "b2", therapist_id: "ther-1", therapist_name: "T1", total_price: 150, duration: 90 }),
        makeBooking({ id: "b3", therapist_id: "ther-noRates", therapist_name: "Tnr", total_price: 80, duration: 60 }),
      ],
      venue,
      rates,
    );

    const t1 = stats.byTherapist.find((b) => b.key === "ther-1");
    const tnr = stats.byTherapist.find((b) => b.key === "ther-noRates");
    expect(t1).toMatchObject({ count: 2, revenue: 250, earnings: 100, hasRates: true });
    expect(tnr).toMatchObject({ count: 1, revenue: 80, earnings: 0, hasRates: false });
  });
});

describe("computeClosureStats — client_type breakdown", () => {
  it("groups by all four client_type values", () => {
    const stats = computeClosureStats(
      [
        makeBooking({ id: "b1", client_type: "hotel", total_price: 100 }),
        makeBooking({ id: "b2", client_type: "hotel", total_price: 50 }),
        makeBooking({ id: "b3", client_type: "staycation", total_price: 80 }),
        makeBooking({ id: "b4", client_type: "classpass", total_price: 30 }),
        makeBooking({ id: "b5", client_type: "external", total_price: 200 }),
      ],
      venue,
      rates,
    );

    const byType = Object.fromEntries(stats.byClientType.map((b) => [b.key, b]));
    expect(byType.hotel).toMatchObject({ count: 2, revenue: 150 });
    expect(byType.staycation).toMatchObject({ count: 1, revenue: 80 });
    expect(byType.classpass).toMatchObject({ count: 1, revenue: 30 });
    expect(byType.external).toMatchObject({ count: 1, revenue: 200 });
  });

  it("sorts byClientType by revenue desc", () => {
    const stats = computeClosureStats(
      [
        makeBooking({ id: "b1", client_type: "hotel", total_price: 50 }),
        makeBooking({ id: "b2", client_type: "external", total_price: 300 }),
      ],
      venue,
      rates,
    );
    expect(stats.byClientType[0].key).toBe("external");
    expect(stats.byClientType[1].key).toBe("hotel");
  });

  it("does not include client_type buckets for non-completed bookings", () => {
    const stats = computeClosureStats(
      [makeBooking({ status: "cancelled", client_type: "hotel" })],
      venue,
      rates,
    );
    expect(stats.byClientType).toHaveLength(0);
  });
});

describe("computeClosureStats — edge cases", () => {
  it("handles zero bookings", () => {
    const stats = computeClosureStats([], venue, rates);
    expect(stats.totalBookings).toBe(0);
    expect(stats.totalRevenue).toBe(0);
    expect(stats.byCategory).toEqual([]);
  });

  it("treats null price as 0", () => {
    const stats = computeClosureStats([makeBooking({ total_price: null })], venue, rates);
    expect(stats.totalRevenue).toBe(0);
  });

  it("uses 'Autres' for treatments without category", () => {
    const stats = computeClosureStats(
      [makeBooking({ treatments: [{ name: "X", category: null, duration: 60 }] })],
      venue,
      rates,
    );
    expect(stats.byCategory[0].label).toBe("Autres");
  });
});

describe("renderClosureReportHtml — hideCommissions flag", () => {
  const report = {
    venue,
    date: "2026-05-11",
    stats: computeClosureStats(
      [
        makeBooking({ id: "b1", therapist_id: "ther-1", total_price: 100 }),
        makeBooking({ id: "b2", therapist_id: "ther-2", total_price: 200 }),
      ],
      venue,
      rates,
    ),
    bookings: [
      makeBooking({ id: "b1", therapist_id: "ther-1", total_price: 100 }),
      makeBooking({ id: "b2", therapist_id: "ther-2", total_price: 200 }),
    ],
  };

  it("includes commission sections when flag is false", () => {
    const html = renderClosureReportHtml(report, { includeDetails: false, hideCommissions: false });
    expect(html).toContain("Part lieu");
    expect(html).toContain("Part thérapeute");
    expect(html).toContain("Part plateforme");
  });

  it("hides commission sections when flag is true", () => {
    const html = renderClosureReportHtml(report, { includeDetails: false, hideCommissions: true });
    expect(html).not.toContain("Part lieu");
    expect(html).not.toContain("Part plateforme");
  });

  it("does not change underlying stats numbers when hidden", () => {
    expect(report.stats.totalVenueShare).toBeCloseTo(30, 2); // 10% of 300
    expect(report.stats.totalTherapistShare).toBeCloseTo(75, 2); // 40 + 35
  });

  it("includes detail table when includeDetails is true", () => {
    const html = renderClosureReportHtml(report, { includeDetails: true });
    expect(html).toContain("Détail des prestations");
  });

  it("omits detail table when includeDetails is false", () => {
    const html = renderClosureReportHtml(report, { includeDetails: false });
    expect(html).not.toContain("Détail des prestations");
  });

  it("shows warning banner when there are bookings without therapist rate", () => {
    const reportWithMissing = {
      ...report,
      stats: computeClosureStats(
        [makeBooking({ therapist_id: "ther-noRates" })],
        venue,
        rates,
      ),
    };
    const html = renderClosureReportHtml(reportWithMissing, { includeDetails: false });
    expect(html).toContain("sans tarif thérapeute");
  });

  it("hides warning banner when hideCommissions is true", () => {
    const reportWithMissing = {
      ...report,
      stats: computeClosureStats(
        [makeBooking({ therapist_id: "ther-noRates" })],
        venue,
        rates,
      ),
    };
    const html = renderClosureReportHtml(reportWithMissing, {
      includeDetails: false,
      hideCommissions: true,
    });
    expect(html).not.toContain("sans tarif thérapeute");
  });
});
