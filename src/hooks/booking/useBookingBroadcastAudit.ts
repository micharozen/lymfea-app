import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Raison pour laquelle un thérapeute du lieu n'a pas été sollicité.
 * L'ordre du type reflète l'ordre d'évaluation de trigger-new-booking-notifications. */
export type BroadcastExclusionReason =
  | "no_pwa_account"
  | "inactive"
  | "declined"
  | "not_qualified"
  | "unavailable";

export interface BroadcastTherapist {
  id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
  status: string;
  gender: string | null;
}

export interface BroadcastAuditRow {
  therapist: BroadcastTherapist;
  /** sent_at du push_notification_logs si sollicité, sinon null. */
  notifiedAt: string | null;
  /** Renseigné uniquement si non sollicité. null = raison inconnue (broadcast jamais déclenché,
   * ou thérapeute rattaché au lieu après l'envoi). */
  exclusionReason: BroadcastExclusionReason | null;
  /** Prestations requises que ce thérapeute ne couvre pas (exclusionReason = "not_qualified"). */
  missingTreatments: string[];
}

export interface BookingBroadcastAudit {
  notified: BroadcastAuditRow[];
  notReached: BroadcastAuditRow[];
}

interface UseBookingBroadcastAuditParams {
  bookingId: string | undefined;
  enabled?: boolean;
}

const ACTIVE_STATUSES = ["active", "actif"];

/**
 * Reconstitue, pour une réservation, qui a été sollicité par le broadcast et pourquoi les autres
 * ne l'ont pas été.
 *
 * Le prédicat rejoué est celui de l'edge function `trigger-new-booking-notifications`, PAS celui de
 * `useAvailableTherapistsForSlot` : l'edge n'exclut que sur une indisponibilité déclarée
 * explicitement (`is_available = false`), là où le hook de créneau est strictement déclaratif.
 * Répliquer le hook afficherait « indisponible » pour des thérapeutes réellement sollicités.
 *
 * C'est une reconstitution « à maintenant » : une disponibilité ou une qualification modifiée depuis
 * l'envoi fausse la raison affichée. L'UI doit le dire.
 */
export function useBookingBroadcastAudit({
  bookingId,
  enabled = true,
}: UseBookingBroadcastAuditParams) {
  return useQuery({
    queryKey: ["booking-broadcast-audit", bookingId],
    enabled: enabled && !!bookingId,
    staleTime: 30_000,
    queryFn: async (): Promise<BookingBroadcastAudit> => {
      if (!bookingId) return { notified: [], notReached: [] };

      // 0. Les colonnes du booking dont dépend le prédicat. Lues ici plutôt qu'ajoutées au
      // select partagé de useBookingData, qui alimente toutes les listes de réservations.
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("hotel_id, booking_date, declined_by")
        .eq("id", bookingId)
        .single();
      if (bookingError) throw bookingError;

      const hotelId = booking?.hotel_id;
      const bookingDate = booking?.booking_date;
      const declinedBy = booking?.declined_by ?? [];
      if (!hotelId) return { notified: [], notReached: [] };

      // 1. Périmètre : les thérapeutes rattachés au lieu.
      const { data: links, error: linksError } = await supabase
        .from("therapist_venues")
        .select(
          "therapist_id, therapists (id, first_name, last_name, profile_image, status, gender, user_id)",
        )
        .eq("hotel_id", hotelId);
      if (linksError) throw linksError;

      type TherapistRow = BroadcastTherapist & { user_id: string | null };
      type LinkRow = { therapists: TherapistRow | TherapistRow[] | null };

      const venueTherapists = ((links as LinkRow[] | null) || [])
        .flatMap((row) => {
          if (!row.therapists) return [];
          return Array.isArray(row.therapists) ? row.therapists : [row.therapists];
        })
        .filter((t): t is TherapistRow => !!t);

      if (venueTherapists.length === 0) return { notified: [], notReached: [] };

      // 2. Les lignes de log : ciblage effectif (insérées avant l'envoi du push).
      const { data: logs, error: logsError } = await supabase
        .from("push_notification_logs")
        .select("user_id, sent_at")
        .eq("booking_id", bookingId);
      if (logsError) throw logsError;

      const sentAtByUserId = new Map((logs || []).map((l) => [l.user_id, l.sent_at]));

      // 3. Prestations requises : add-ons et amenities exclus, comme reserve_trunk_atomically.
      const { data: requiredRows } = await supabase
        .from("booking_treatments")
        .select("treatment_id, treatment_menus!inner(name, amenity_id)")
        .eq("booking_id", bookingId)
        .eq("is_addon", false)
        .is("treatment_menus.amenity_id", null);

      type RequiredRow = {
        treatment_id: string;
        treatment_menus: { name: string } | { name: string }[] | null;
      };
      const treatmentNames = new Map<string, string>();
      (requiredRows as RequiredRow[] | null)?.forEach((row) => {
        const menu = Array.isArray(row.treatment_menus) ? row.treatment_menus[0] : row.treatment_menus;
        if (menu) treatmentNames.set(row.treatment_id, menu.name);
      });
      const requiredTreatmentIds = [...treatmentNames.keys()];

      // 4. Qualifications. Aucune association = polyvalent.
      const ownedByTherapist = new Map<string, Set<string>>();
      if (requiredTreatmentIds.length > 0) {
        const { data: ownedRows } = await supabase
          .from("therapist_treatments")
          .select("therapist_id, treatment_menu_id")
          .in(
            "therapist_id",
            venueTherapists.map((t) => t.id),
          );
        (ownedRows || []).forEach((row) => {
          const owned = ownedByTherapist.get(row.therapist_id) ?? new Set<string>();
          owned.add(row.treatment_menu_id);
          ownedByTherapist.set(row.therapist_id, owned);
        });
      }

      // 5. Indisponibilités déclarées explicitement pour la date.
      const blockedTherapistIds = new Set<string>();
      if (bookingDate) {
        const { data: unavailable } = await supabase
          .from("therapist_availability")
          .select("therapist_id")
          .eq("date", bookingDate)
          .eq("is_available", false)
          .in(
            "therapist_id",
            venueTherapists.map((t) => t.id),
          );
        (unavailable || []).forEach((row) => blockedTherapistIds.add(row.therapist_id));
      }

      const declinedSet = new Set(declinedBy);

      const notified: BroadcastAuditRow[] = [];
      const notReached: BroadcastAuditRow[] = [];

      venueTherapists.forEach((t) => {
        const { user_id, ...therapist } = t;
        const notifiedAt = user_id ? sentAtByUserId.get(user_id) ?? null : null;

        if (notifiedAt) {
          notified.push({ therapist, notifiedAt, exclusionReason: null, missingTreatments: [] });
          return;
        }

        const owned = ownedByTherapist.get(t.id);
        const missingTreatments =
          owned && owned.size > 0
            ? requiredTreatmentIds.filter((id) => !owned.has(id)).map((id) => treatmentNames.get(id)!)
            : [];

        // Ordre d'évaluation identique à l'edge function.
        let exclusionReason: BroadcastExclusionReason | null = null;
        if (!user_id) exclusionReason = "no_pwa_account";
        else if (!ACTIVE_STATUSES.includes((t.status || "").toLowerCase())) exclusionReason = "inactive";
        else if (declinedSet.has(t.id)) exclusionReason = "declined";
        else if (missingTreatments.length > 0) exclusionReason = "not_qualified";
        else if (blockedTherapistIds.has(t.id)) exclusionReason = "unavailable";

        notReached.push({ therapist, notifiedAt: null, exclusionReason, missingTreatments });
      });

      notified.sort(
        (a, b) =>
          (a.notifiedAt || "").localeCompare(b.notifiedAt || "") ||
          a.therapist.first_name.localeCompare(b.therapist.first_name),
      );
      notReached.sort((a, b) => a.therapist.first_name.localeCompare(b.therapist.first_name));

      return { notified, notReached };
    },
  });
}
