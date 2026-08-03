import { describe, it, expect } from "vitest";
import { brand } from "@/config/brand";
import {
  CLIENT_TYPE_COLORS,
  closureIssuer,
  closurePaymentLabel,
  closureRoomNumber,
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

  it("never renders the commission split cards", () => {
    const html = renderClosureReportHtml(report, { includeDetails: false, hideCommissions: false });
    expect(html).not.toContain("Part lieu");
    expect(html).not.toContain("Part plateforme");
  });

  it("omits the upcoming/pending metrics", () => {
    const html = renderClosureReportHtml(report, { includeDetails: false });
    expect(html).not.toContain("Confirmées (à venir)");
    expect(html).not.toContain("En attente");
  });

  it("never renders the per-therapist share column", () => {
    expect(renderClosureReportHtml(report, { includeDetails: false })).not.toContain("Part thér");
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

describe("détail des prestations", () => {
  const hotelGuest = makeBooking({
    id: "b1",
    client_type: "hotel",
    room_number: "412",
    payment_method: "room",
    payment_status: "charged_to_room",
  });
  const walkIn = makeBooking({
    id: "b2",
    client_type: "external",
    room_number: null,
    payment_method: null,
    payment_status: "pending",
  });

  const report = {
    venue,
    date: "2026-05-11",
    stats: computeClosureStats([hotelGuest, walkIn], venue, rates),
    bookings: [hotelGuest, walkIn],
  };
  const html = renderClosureReportHtml(report, { includeDetails: true });

  it("drops the time column", () => {
    expect(html).not.toContain(">Heure<");
  });

  it("shows a room number column filled for hotel guests only", () => {
    expect(html).toContain(">Chambre<");
    expect(closureRoomNumber(hotelGuest)).toBe("412");
    expect(closureRoomNumber(walkIn)).toBe("—");
  });

  it("keeps a room number off non-hotel clients even when one is stored", () => {
    expect(closureRoomNumber({ client_type: "external", room_number: "412" })).toBe("—");
  });

  it("labels on-site payments instead of showing a dash", () => {
    expect(closurePaymentLabel(null, "pending")).toBe("À régler sur place");
    expect(closurePaymentLabel("card", "paid")).toBe("Carte — paiement en ligne");
    expect(closurePaymentLabel(null, null)).toBe("—");
    expect(html).toContain("À régler sur place");
  });

  it("groups on-site payments in the payment breakdown", () => {
    const labels = report.stats.byPaymentMethod.map((b) => b.label);
    expect(labels).toContain("À régler sur place");
    expect(labels).toContain("Note de chambre");
  });
});

describe("répartition par type de client", () => {
  it("exposes the share of completed bookings as a percentage", () => {
    const stats = computeClosureStats(
      [
        makeBooking({ id: "b1", client_type: "hotel" }),
        makeBooking({ id: "b2", client_type: "hotel" }),
        makeBooking({ id: "b3", client_type: "external" }),
        makeBooking({ id: "b4", client_type: "external" }),
      ],
      venue,
      rates,
    );
    expect(stats.byClientType).toHaveLength(2);
    for (const bucket of stats.byClientType) {
      expect(bucket.count).toBe(2);
      expect(bucket.sharePercent).toBeCloseTo(50, 5);
    }
  });

  it("renders the percentage column in the report", () => {
    const bookings = [
      makeBooking({ id: "b1", client_type: "hotel" }),
      makeBooking({ id: "b2", client_type: "external" }),
    ];
    const html = renderClosureReportHtml(
      { venue, date: "2026-05-11", stats: computeClosureStats(bookings, venue, rates), bookings },
      { includeDetails: false },
    );
    expect(html).toContain("Part");
    expect(html).toContain("50 %");
  });

  it("renders no gauge in the report", () => {
    const bookings = [
      makeBooking({ id: "b1", client_type: "hotel" }),
      makeBooking({ id: "b2", client_type: "external" }),
    ];
    const html = renderClosureReportHtml(
      { venue, date: "2026-05-11", stats: computeClosureStats(bookings, venue, rates), bookings },
      { includeDetails: false },
    );
    expect(html).not.toContain(CLIENT_TYPE_COLORS.hotel);
    expect(html).not.toContain(CLIENT_TYPE_COLORS.external);
  });
});

describe("croisement type de client × moyen de paiement", () => {
  const bookings = [
    makeBooking({ id: "b1", client_type: "hotel", payment_method: "room", payment_status: "charged_to_room", total_price: 90 }),
    makeBooking({ id: "b2", client_type: "hotel", payment_method: "room", payment_status: "charged_to_room", total_price: 75 }),
    makeBooking({ id: "b3", client_type: "external", payment_method: null, payment_status: "pending", total_price: 60 }),
    makeBooking({ id: "b4", client_type: "external", payment_method: "card", payment_status: "paid", total_price: 55 }),
  ];
  const stats = computeClosureStats(bookings, venue, rates);

  it("groups completed bookings by client type and payment method", () => {
    expect(stats.byClientTypeAndPayment).toHaveLength(3);
    const hotelRoom = stats.byClientTypeAndPayment.find(
      (b) => b.clientTypeKey === "hotel" && b.paymentLabel === "Note de chambre",
    );
    expect(hotelRoom).toMatchObject({ count: 2, revenue: 165 });
  });

  it("keeps on-site payments as their own cell", () => {
    const onSite = stats.byClientTypeAndPayment.find(
      (b) => b.clientTypeKey === "external" && b.paymentLabel === "À régler sur place",
    );
    expect(onSite).toMatchObject({ count: 1, revenue: 60 });
  });

  it("excludes non-completed bookings", () => {
    const withCancelled = computeClosureStats(
      [...bookings, makeBooking({ id: "b5", client_type: "hotel", status: "cancelled", total_price: 200 })],
      venue,
      rates,
    );
    const total = withCancelled.byClientTypeAndPayment.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(4);
  });

  it("renders the cross table in the report", () => {
    const html = renderClosureReportHtml(
      { venue, date: "2026-05-11", stats, bookings },
      { includeDetails: false },
    );
    expect(html).toContain("Type de client × moyen de paiement");
    expect(html).toContain("À régler sur place");
  });
});

describe("émetteur du rapport", () => {
  it("uses the venue organisation name when present", () => {
    const html = renderClosureReportHtml(
      {
        venue: { ...venue, organization_name: "Groupe Hana" },
        date: "2026-05-11",
        stats: computeClosureStats([makeBooking()], venue, rates),
        bookings: [makeBooking()],
      },
      { includeDetails: false },
    );
    expect(html).toContain("Groupe Hana · Clôture quotidienne");
    expect(html).toContain("Rapport généré par Groupe Hana");
    expect(html).not.toContain("Eïa");
  });

  it("falls back to the platform brand when the venue has no organisation", () => {
    expect(closureIssuer(venue)).toBe(brand.name);
    expect(closureIssuer({ ...venue, organization_name: "   " })).toBe(brand.name);
  });
});
