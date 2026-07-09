import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** One booking_treatments line and the therapist it should be assigned to. */
export interface LineAssignment {
  bookingTreatmentId: string;
  therapistId: string;
}

/**
 * Reassign the therapist of one or more booking_treatments lines and keep the
 * booking's assignment invariants in sync:
 *  - booking_treatments.therapist_id (stable soin↔therapist link)
 *  - booking_therapists roster (drives the PWA dashboard visibility)
 *  - bookings.therapist_id (primary = first line's therapist)
 *
 * The caller passes the COMPLETE resolved mapping for every line that has a
 * therapist (fallback positions materialized), so the roster can be rebuilt as
 * exactly the set of therapists who now perform at least one soin.
 */
export function useReassignTreatmentTherapists() {
  const [loading, setLoading] = useState(false);

  const reassign = async (
    bookingId: string,
    assignments: LineAssignment[],
  ): Promise<void> => {
    if (assignments.length === 0) return;
    setLoading(true);
    try {
      // 1. Persist the therapist_id on each line, grouped per therapist to
      //    minimise round-trips.
      const byTherapist = new Map<string, string[]>();
      for (const a of assignments) {
        const ids = byTherapist.get(a.therapistId) ?? [];
        ids.push(a.bookingTreatmentId);
        byTherapist.set(a.therapistId, ids);
      }
      for (const [therapistId, lineIds] of byTherapist) {
        const { error } = await supabase
          .from("booking_treatments")
          .update({ therapist_id: therapistId })
          .in("id", lineIds);
        if (error) throw error;
      }

      // 2. Roster = the distinct therapists who now perform a soin.
      const distinctIds = [...byTherapist.keys()];

      // Drop accepted therapists that no longer have any soin on this booking.
      const { error: delError } = await supabase
        .from("booking_therapists")
        .delete()
        .eq("booking_id", bookingId)
        .eq("status", "accepted")
        .not("therapist_id", "in", `(${distinctIds.join(",")})`);
      if (delError) throw delError;

      // Add the current therapists (ignore duplicates — an accept_booking may
      // race and reinsert; see EditBookingDialog for the same guard).
      const { error: upsertError } = await supabase
        .from("booking_therapists")
        .upsert(
          distinctIds.map((therapist_id) => ({
            booking_id: bookingId,
            therapist_id,
            status: "accepted",
          })),
          { onConflict: "booking_id,therapist_id", ignoreDuplicates: true },
        );
      if (upsertError) throw upsertError;

      // 3. Primary therapist = first line's therapist (stable line order).
      const { error: bookingError } = await supabase
        .from("bookings")
        .update({ therapist_id: assignments[0].therapistId })
        .eq("id", bookingId);
      if (bookingError) throw bookingError;
    } finally {
      setLoading(false);
    }
  };

  return { reassign, loading };
}
