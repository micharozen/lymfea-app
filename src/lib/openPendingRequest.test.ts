import { describe, expect, it } from "vitest";
import { isOpenPendingRequest } from "./openPendingRequest";

const ME = "t-me";
const OTHER = "t-other";

const leg = (therapist_id: string | null, amenity_id: string | null = null) => ({
  therapist_id,
  is_addon: false,
  treatment_menus: { amenity_id },
});

describe("isOpenPendingRequest", () => {
  it("retient un solo sans praticien", () => {
    expect(
      isOpenPendingRequest(
        { guest_count: 1, therapist_id: null, booking_treatments: [leg(null)] },
        ME,
      ),
    ).toBe(true);
  });

  it("écarte un solo entièrement pris par un confrère", () => {
    expect(
      isOpenPendingRequest(
        { guest_count: 1, therapist_id: OTHER, booking_treatments: [leg(OTHER)] },
        ME,
      ),
    ).toBe(false);
  });

  it("retient un solo partagé dont une jambe attend encore (issue #547)", () => {
    // Cas du booking 67 : un confrère a pris le soin visage, le massage est libre.
    expect(
      isOpenPendingRequest(
        {
          guest_count: 1,
          therapist_id: OTHER,
          booking_therapists: [{ status: "accepted", therapist_id: OTHER }],
          booking_treatments: [leg(null), leg(OTHER)],
        },
        ME,
      ),
    ).toBe(true);
  });

  it("ne repropose pas la jambe restante à qui a déjà accepté", () => {
    expect(
      isOpenPendingRequest(
        {
          guest_count: 1,
          therapist_id: ME,
          booking_therapists: [{ status: "accepted", therapist_id: ME }],
          booking_treatments: [leg(null), leg(ME)],
        },
        ME,
      ),
    ).toBe(false);
  });

  it("ne prend pas une commodité libre pour une jambe à pourvoir", () => {
    expect(
      isOpenPendingRequest(
        {
          guest_count: 1,
          therapist_id: OTHER,
          booking_treatments: [leg(OTHER), leg(null, "amenity-1")],
        },
        ME,
      ),
    ).toBe(false);
  });

  it("retient un duo tant que je n'ai pas accepté", () => {
    const duo = {
      guest_count: 2,
      therapist_id: OTHER,
      booking_treatments: [leg(OTHER), leg(null)],
    };
    expect(isOpenPendingRequest(duo, ME)).toBe(true);
    expect(
      isOpenPendingRequest(
        { ...duo, booking_therapists: [{ status: "accepted", therapist_id: ME }] },
        ME,
      ),
    ).toBe(false);
  });
});
