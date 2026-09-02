import { describe, expect, it } from "vitest";
import { myLegSlot } from "./myLegSlot";

const ME = "t-me";
const OTHER = "t-other";

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

describe("myLegSlot", () => {
  it("laisse intact le créneau d'un praticien seul", () => {
    const b = {
      booking_time: "14:00:00",
      duration: 105,
      guest_count: 1,
      booking_treatments: [line("l1", ME, 60), line("l2", ME, 45)],
    };
    expect(myLegSlot(b, ME)).toMatchObject({ booking_time: "14:00:00", duration: 105 });
  });

  it("décale au second soin celui qui n'assure que lui (booking 67)", () => {
    const b = {
      booking_time: "14:00:00",
      duration: 105,
      guest_count: 1,
      booking_treatments: [line("l1", OTHER, 60), line("l2", ME, 45)],
    };
    expect(myLegSlot(b, ME)).toMatchObject({ booking_time: "15:00:00", duration: 45 });
  });

  it("garde l'heure de début pour qui assure le soin le plus long", () => {
    const b = {
      booking_time: "14:00:00",
      duration: 105,
      guest_count: 1,
      booking_treatments: [line("l1", ME, 60), line("l2", OTHER, 45)],
    };
    expect(myLegSlot(b, ME)).toMatchObject({ booking_time: "14:00:00", duration: 60 });
  });

  it("ne décale pas un duo, dont les jambes sont parallèles", () => {
    const b = {
      booking_time: "14:00:00",
      duration: 60,
      guest_count: 2,
      booking_treatments: [line("l1", OTHER, 60), line("l2", ME, 60)],
    };
    expect(myLegSlot(b, ME)).toMatchObject({ booking_time: "14:00:00", duration: 60 });
  });

  it("compte dans ma jambe l'add-on qui prolonge mon soin", () => {
    const b = {
      booking_time: "14:00:00",
      duration: 120,
      guest_count: 1,
      booking_treatments: [
        line("l1", OTHER, 60),
        line("l2", ME, 45),
        line("l3", ME, 15, true, "l2"),
      ],
    };
    expect(myLegSlot(b, ME)).toMatchObject({ booking_time: "15:00:00", duration: 60 });
  });

  it("laisse intact un créneau dont aucune ligne ne m'est attribuée", () => {
    const b = {
      booking_time: "14:00:00",
      duration: 105,
      guest_count: 1,
      booking_treatments: [line("l1", null, 60), line("l2", OTHER, 45)],
    };
    expect(myLegSlot(b, ME)).toMatchObject({ booking_time: "14:00:00", duration: 105 });
  });

  it("ne garde que mes prestations sur une réservation partagée", () => {
    const b = {
      booking_time: "14:00:00",
      duration: 105,
      guest_count: 1,
      booking_treatments: [line("l1", OTHER, 60), line("l2", ME, 45)],
    };
    expect(myLegSlot(b, ME).booking_treatments?.map((l) => l.id)).toEqual(["l2"]);
  });

  it("passe l'heure au-delà de l'heure ronde", () => {
    const b = {
      booking_time: "14:30:00",
      duration: 135,
      guest_count: 1,
      booking_treatments: [line("l1", OTHER, 90), line("l2", ME, 45)],
    };
    expect(myLegSlot(b, ME)).toMatchObject({ booking_time: "16:00:00", duration: 45 });
  });
});
