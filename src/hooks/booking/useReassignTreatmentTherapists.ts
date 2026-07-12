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
 *  - bookings.therapist_id / therapist_name (primary = first line's therapist)
 *  - bookings.status: pending → confirmed once every soin line has a therapist
 *    (same rule as EditBookingDialog — a manual assignment counts as acceptance)
 *
 * The caller passes the COMPLETE resolved mapping for every line that has a
 * therapist (fallback positions materialized), so the roster can be rebuilt as
 * exactly the set of therapists who now perform at least one soin.
 *
 * Returns `becameConfirmed` so the caller can fire the confirmation
 * notifications (trigger-new-booking-notifications), like the edit dialog does.
 */
export function useReassignTreatmentTherapists() {
  const [loading, setLoading] = useState(false);

  const reassign = async (
    bookingId: string,
    assignments: LineAssignment[],
  ): Promise<{ becameConfirmed: boolean }> => {
    if (assignments.length === 0) return { becameConfirmed: false };
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
      const primaryTherapistId = assignments[0].therapistId;
      const [bookingRes, linesRes, therapistRes] = await Promise.all([
        supabase.from("bookings").select("status").eq("id", bookingId).single(),
        supabase.from("booking_treatments").select("id").eq("booking_id", bookingId),
        supabase.from("therapists").select("first_name, last_name").eq("id", primaryTherapistId).single(),
      ]);
      if (bookingRes.error) throw bookingRes.error;
      if (linesRes.error) throw linesRes.error;

      const assignedLineIds = new Set(assignments.map((a) => a.bookingTreatmentId));
      const allLinesAssigned = (linesRes.data ?? []).every((l) => assignedLineIds.has(l.id));
      const becameConfirmed = bookingRes.data.status === "pending" && allLinesAssigned;

      const therapistName = therapistRes.data
        ? `${therapistRes.data.first_name} ${therapistRes.data.last_name}`.trim()
        : null;

      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          therapist_id: primaryTherapistId,
          ...(therapistName ? { therapist_name: therapistName } : {}),
          ...(becameConfirmed
            ? { status: "confirmed", assigned_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", bookingId);
      if (bookingError) throw bookingError;

      return { becameConfirmed };
    } finally {
      setLoading(false);
    }
  };

  return { reassign, loading };
}
