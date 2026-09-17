import { describe, expect, it } from "vitest";
import { bookingContextPatch } from "./bookingContext";
import type { BookingSearchResult } from "@/lib/bookingSearch";

const booking = (overrides: Partial<BookingSearchResult> = {}): BookingSearchResult => ({
  id: "b1",
  booking_id: 12,
  booking_date: "2026-10-02",
  hotel_id: "h1",
  client_type: "hotel",
  client_first_name: "Jean",
  client_last_name: "Dupont",
  booking_treatments: null,
  booking_therapists: null,
  customer: null,
  ...overrides,
});

describe("bookingContextPatch", () => {
  it("reprend le contexte de la réservation", () => {
    expect(bookingContextPatch(booking())).toEqual({
      booking_id: "b1",
      hotel_id: "h1",
      treatment_date: "2026-10-02",
      client_type: "hotel",
    });
  });

  it("lie la fiche client de la réservation", () => {
    const patch = bookingContextPatch(
      booking({ customer: { id: "c1", first_name: "Jean", last_name: "Dupont", phone: null, email: null } }),
    );
    expect(patch.customer_id).toBe("c1");
  });

  it("ignore les add-ons et dédoublonne les soins", () => {
    const patch = bookingContextPatch(
      booking({
        booking_treatments: [
          { treatment_id: "t1", is_addon: false },
          { treatment_id: "t1", is_addon: false },
          { treatment_id: "t2", is_addon: true },
        ],
      }),
    );
    expect(patch.treatment_menu_ids).toEqual(["t1"]);
  });

  it("n'écrase pas les listes de la tâche quand la réservation n'a rien à donner", () => {
    const patch = bookingContextPatch(
      booking({ booking_treatments: [], booking_therapists: [{ therapist_id: null }] }),
    );
    expect(patch).not.toHaveProperty("treatment_menu_ids");
    expect(patch).not.toHaveProperty("therapist_ids");
  });

  it("n'invente rien quand les champs sont vides", () => {
    const patch = bookingContextPatch(
      booking({ hotel_id: null, booking_date: null, client_type: null }),
    );
    expect(patch).toEqual({ booking_id: "b1" });
  });
});
