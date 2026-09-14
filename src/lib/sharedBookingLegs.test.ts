import { describe, expect, it } from "vitest";
import { splitSharedBookingLegs } from "./sharedBookingLegs";

const A = "t-a";
const B = "t-b";

// L'ordre d'exécution vient de `scheduleTreatments` : le soin le plus long
// passe en premier, `created_at` puis `id` départageant à durée égale.
const line = (
  id: string,
  therapist_id: string | null,
  duration: number,
  is_addon = false,
  parent_booking_treatment_id: string | null = null,
) => ({
  id,
  therapist_id,
  is_addon,
  parent_booking_treatment_id,
  treatment_menus: { duration },
});

describe("splitSharedBookingLegs", () => {
  it("laisse en un bloc une réservation à praticien unique", () => {
    const legs = splitSharedBookingLegs({
      id: "b1",
      booking_time: "14:00:00",
      duration: 105,
      guest_count: 1,
      booking_treatments: [line("l1", A, 60), line("l2", A, 45)],
    });
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ legKey: "b1", booking_time: "14:00:00", duration: 105 });
  });

  it("découpe une réservation partagée en une jambe par praticien (booking 67)", () => {
    const legs = splitSharedBookingLegs({
      id: "b1",
      booking_time: "14:00:00",
      duration: 105,
      guest_count: 1,
      booking_treatments: [line("l1", B, 60), line("l2", A, 45)],
    });
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({
      legKey: "b1:l1",
      legTherapistId: B,
      booking_time: "14:00:00",
      duration: 60,
    });
    expect(legs[1]).toMatchObject({
      legKey: "b1:l2",
      legTherapistId: A,
      booking_time: "15:00:00",
      duration: 45,
    });
  });

  it("garde la jambe non pourvue, qui occupe la salle", () => {
    const legs = splitSharedBookingLegs({
      id: "b1",
      booking_time: "14:00:00",
      duration: 105,
      guest_count: 1,
      booking_treatments: [line("l1", null, 60), line("l2", A, 45)],
    });
    expect(legs.map((l) => l.legTherapistId)).toEqual([null, A]);
    expect(legs[1].booking_time).toBe("15:00:00");
  });

  it("n'expose à chaque jambe que ses propres soins", () => {
    const legs = splitSharedBookingLegs({
      id: "b1",
      booking_time: "14:00:00",
      duration: 105,
      guest_count: 1,
      booking_treatments: [line("l1", B, 60), line("l2", A, 45)],
    });
    expect(legs[0].booking_treatments?.map((l) => l.id)).toEqual(["l1"]);
    expect(legs[1].booking_treatments?.map((l) => l.id)).toEqual(["l2"]);
  });

  it("rattache un add-on à la jambe qu'il prolonge et décale la suite", () => {
    const legs = splitSharedBookingLegs({
      id: "b1",
      booking_time: "14:00:00",
      duration: 120,
      guest_count: 1,
      booking_treatments: [line("l1", B, 60), line("l2", A, 45), line("l3", B, 15, true, "l1")],
    });
    expect(legs[0]).toMatchObject({ duration: 75, booking_time: "14:00:00" });
    expect(legs[1]).toMatchObject({ duration: 45, booking_time: "15:15:00" });
  });

  it("ne découpe pas un duo, dont les jambes sont parallèles", () => {
    const legs = splitSharedBookingLegs({
      id: "b1",
      booking_time: "14:00:00",
      duration: 60,
      guest_count: 2,
      booking_treatments: [line("l1", A, 60), line("l2", B, 60)],
    });
    expect(legs).toHaveLength(1);
    expect(legs[0].booking_time).toBe("14:00:00");
  });
});
