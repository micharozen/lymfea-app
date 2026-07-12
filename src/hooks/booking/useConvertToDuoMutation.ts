import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import type { BookingListItem } from "@shared/db";

/** One booking_treatments line and the therapist assigned to it (assign mode). */
export interface ConvertAssignment {
  bookingTreatmentId: string;
  therapistId: string;
}

export interface ConvertToDuoParams {
  mode: "assign" | "broadcast";
  /** assign mode: exactly one therapist per soin, all distinct. */
  assignments?: ConvertAssignment[];
  /** Display name of the primary therapist (assignments[0]) — mirrors bookings.therapist_name. */
  primaryTherapistName?: string | null;
  /** Optional secondary room, must differ from booking.room_id (else ignored). */
  secondaryRoomId?: string | null;
}

/**
 * One-way conversion of a non-duo booking into a duo, dispatching a therapist
 * per soin. Solo↔duo distinction is by guest_count (never by status).
 *
 * assign    → therapists chosen now: booking_treatments.therapist_id set per line,
 *             booking_therapists roster rebuilt, status → confirmed.
 * broadcast → therapists join on acceptance: status → pending, links left NULL,
 *             existing roster preserved (+ primary backfilled for the RPC counter).
 */
export function useConvertToDuoMutation(
  booking: BookingListItem,
  onSuccess?: () => void,
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("admin");

  return useMutation({
    mutationFn: async (params: ConvertToDuoParams) => {
      const treatments = booking.treatments ?? [];
      // Add-ons are supplements, not guests' soins: they never add a guest, and they
      // extend the leg of the soin they hang off rather than forming their own.
      const baseTreatments = treatments.filter((tr) => !tr.is_addon);
      const addonTreatments = treatments.filter((tr) => tr.is_addon);
      const guestCount = baseTreatments.length;

      const legDurations = baseTreatments.map((tr) => {
        const addonMinutes = addonTreatments
          .filter((a) => a.parent_booking_treatment_id === tr.bookingTreatmentId)
          .reduce((sum, a) => sum + (a.duration ?? 0), 0);
        return (tr.duration ?? 0) + addonMinutes;
      });
      const orphanMinutes = addonTreatments
        .filter((a) => !a.parent_booking_treatment_id)
        .reduce((sum, a) => sum + (a.duration ?? 0), 0);
      const longestLeg = legDurations.filter((d) => d > 0);
      const newDuration = longestLeg.length > 0
        ? Math.max(...longestLeg) + orphanMinutes
        : booking.duration ?? 60;

      // Secondary room only when it genuinely differs from the primary room.
      const secondaryRoomId =
        params.secondaryRoomId && params.secondaryRoomId !== booking.room_id
          ? params.secondaryRoomId
          : null;

      if (params.mode === "assign") {
        const assignments = params.assignments ?? [];
        if (assignments.length !== guestCount) {
          throw new Error("Chaque soin doit avoir un praticien.");
        }
        const distinctIds = [...new Set(assignments.map((a) => a.therapistId))];
        if (distinctIds.length !== assignments.length) {
          throw new Error("Un praticien ne peut pas faire deux soins en parallèle.");
        }

        const now = new Date().toISOString();

        // 1. Booking: promote to duo + confirmed, primary = first soin's therapist.
        const { error: bookingError } = await supabase
          .from("bookings")
          .update({
            guest_count: guestCount,
            duration: newDuration,
            status: "confirmed",
            therapist_id: assignments[0].therapistId,
            therapist_name: params.primaryTherapistName ?? null,
            assigned_at: now,
            secondary_room_id: secondaryRoomId,
          })
          .eq("id", booking.id);
        if (bookingError) throw bookingError;

        // 2. Stable soin↔therapist link, per line. Each add-on follows the therapist
        //    of the soin it extends; an orphan add-on goes to the primary.
        const therapistByLine = new Map(assignments.map((a) => [a.bookingTreatmentId, a.therapistId]));
        const addonAssignments = addonTreatments
          .filter((a) => a.bookingTreatmentId)
          .map((a) => ({
            bookingTreatmentId: a.bookingTreatmentId!,
            therapistId:
              (a.parent_booking_treatment_id && therapistByLine.get(a.parent_booking_treatment_id)) ||
              assignments[0].therapistId,
          }));

        for (const a of [...assignments, ...addonAssignments]) {
          const { error } = await supabase
            .from("booking_treatments")
            .update({ therapist_id: a.therapistId })
            .eq("id", a.bookingTreatmentId);
          if (error) throw error;
        }

        // 3. Roster = distinct set of therapists (delete-all then insert).
        const { error: delError } = await supabase
          .from("booking_therapists")
          .delete()
          .eq("booking_id", booking.id);
        if (delError) throw delError;
        const { error: insError } = await supabase
          .from("booking_therapists")
          .insert(
            distinctIds.map((therapist_id) => ({
              booking_id: booking.id,
              therapist_id,
              status: "accepted",
              assigned_at: now,
            })),
          );
        if (insError) throw insError;

        // 4. Notify (primary only — parity with the duo edit flow).
        try {
          await invokeEdgeFunction("trigger-new-booking-notifications", {
            body: { bookingId: booking.id },
          });
        } catch (notifError) {
          console.error("Error sending push notification:", notifError);
          toast.warning(t("booking.convertToDuo.notificationWarning"));
        }
      } else {
        // broadcast
        const { error: bookingError } = await supabase
          .from("bookings")
          .update({
            guest_count: guestCount,
            duration: newDuration,
            status: "pending",
            secondary_room_id: secondaryRoomId,
          })
          .eq("id", booking.id);
        if (bookingError) throw bookingError;

        // Backfill the primary into the roster so accept_booking's counter is
        // correct (guest_count vs COUNT(accepted)). Ignore if already present.
        if (booking.therapist_id) {
          const { error: btError } = await supabase
            .from("booking_therapists")
            .upsert(
              [{ booking_id: booking.id, therapist_id: booking.therapist_id, status: "accepted" }],
              { onConflict: "booking_id,therapist_id", ignoreDuplicates: true },
            );
          if (btError) throw btError;
        }

        try {
          await invokeEdgeFunction("trigger-new-booking-notifications", {
            body: { bookingId: booking.id, sendPaymentLink: false, notifyAll: true },
          });
        } catch (notifError) {
          console.error("Error sending push notification:", notifError);
          toast.warning(t("booking.convertToDuo.notificationWarning"));
        }
      }

      return params.mode;
    },
    onSuccess: (mode) => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking-therapists", booking.id] });
      queryClient.invalidateQueries({ queryKey: ["available-therapists-for-slot"] });
      queryClient.invalidateQueries({ queryKey: ["available-rooms"] });
      toast.success(
        mode === "assign"
          ? t("booking.convertToDuo.successAssign")
          : t("booking.convertToDuo.successBroadcast"),
      );
      onSuccess?.();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : t("booking.convertToDuo.error");
      toast.error(message);
    },
  });
}
