import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface AvailableTherapist {
  id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
  skills: string[] | null;
  status: string;
  gender: string | null;
}

export interface SlotTherapist extends AvailableTherapist {
  /** Déclaré ouvert sur le créneau (therapist_availability) ET sans booking en conflit. */
  isAvailableForSlot: boolean;
  /** Heure de fin du shift ("HH:mm") quand le shift couvre le début du soin mais pas la fin, sinon null. */
  shiftEndsBeforeSlotEnd: string | null;
}

/** Sépare une liste annotée en « Disponibles » / « Autres thérapeutes du lieu ».
 * Les items sans flag (listes plates legacy) sont traités comme disponibles. */
export function partitionTherapistsForSlot<T extends { isAvailableForSlot?: boolean }>(
  list: T[] | undefined,
): { available: T[]; others: T[] } {
  const available: T[] = [];
  const others: T[] = [];
  (list || []).forEach((t) => {
    (t.isAvailableForSlot === false ? others : available).push(t);
  });
  return { available, others };
}

interface UseAvailableTherapistsForSlotParams {
  hotelId: string | undefined;
  date: Date | undefined;
  time: string;
  durationMinutes: number;
  treatmentIds?: string[];
  /** Booking to ignore in the overlap computation (e.g. when converting it to duo,
   * its own already-assigned therapist must not mark itself as busy). */
  excludeBookingId?: string;
}

const ACTIVE_STATUSES = ["Actif", "active", "Active"];
const EXCLUDED_BOOKING_STATUSES = [
  "Annulé",
  "cancelled",
  "canceled",
  "Terminé",
  "completed",
  "no_show",
  "noshow"
];

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function useAvailableTherapistsForSlot({
  hotelId,
  date,
  time,
  durationMinutes,
  treatmentIds,
  excludeBookingId,
}: UseAvailableTherapistsForSlotParams) {
  const dateStr = date ? format(date, "yyyy-MM-dd") : "";
  const enabled = !!hotelId && !!dateStr && !!time && durationMinutes > 0;
  const sortedTreatmentIds = [...(treatmentIds || [])].sort();

  return useQuery({
    queryKey: ["available-therapists-for-slot", hotelId, dateStr, time, durationMinutes, sortedTreatmentIds, excludeBookingId ?? null],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<SlotTherapist[]> => {
      if (!hotelId || !dateStr || !time) return [];

      // 1. Récupérer le buffer de rotation des salles
      const { data: hotelSettings } = await supabase
        .from("hotels")
        .select("room_turnover_buffer_minutes")
        .eq("id", hotelId)
        .single();
      const turnoverBuffer = hotelSettings?.room_turnover_buffer_minutes ?? 0;

      // 2. Récupérer les praticiens du lieu
      const { data: links, error: linksError } = await supabase
        .from("therapist_venues")
        .select("therapist_id, therapists (id, first_name, last_name, profile_image, skills, status, gender)")
        .eq("hotel_id", hotelId);

      if (linksError) throw linksError;

      type LinkRow = { therapists: AvailableTherapist | AvailableTherapist[] | null };
      const venueTherapists: AvailableTherapist[] = ((links as LinkRow[] | null) || [])
        .flatMap((row) => {
          if (!row.therapists) return [];
          return Array.isArray(row.therapists) ? row.therapists : [row.therapists];
        })
        .filter((t): t is AvailableTherapist => !!t && ACTIVE_STATUSES.includes(t.status));

      if (venueTherapists.length === 0) return [];

      // 3. Récupérer les réservations pour vérifier les chevauchements
      const { data: sameDayBookings, error: bookingsError } = await supabase
        .from("bookings")
        .select("id, therapist_id, booking_time, duration, status")
        .eq("hotel_id", hotelId)
        .eq("booking_date", dateStr)
        .not("therapist_id", "is", null);
      if (bookingsError) throw bookingsError;

      const requestedStart = timeToMinutes(time);
      const requestedEnd = requestedStart + durationMinutes + turnoverBuffer;
      const busyTherapistIds = new Set<string>();
      const isExcludedStatus = (status: string) => EXCLUDED_BOOKING_STATUSES.includes(status);

      (sameDayBookings || []).forEach((b) => {
        if (!b.therapist_id || isExcludedStatus(b.status)) return;
        if (excludeBookingId && b.id === excludeBookingId) return;
        const bStart = timeToMinutes(b.booking_time);
        const bEnd = bStart + (b.duration || 60) + turnoverBuffer;
        if (bStart < requestedEnd && bEnd > requestedStart) busyTherapistIds.add(b.therapist_id);
      });

      // 4. Vérifier aussi la table booking_therapists (soins duo)
      const { data: multipleBookings } = await supabase
        .from("booking_therapists")
        .select("therapist_id, booking_id, bookings!inner(booking_time, duration, status, booking_date)")
        .eq("bookings.booking_date", dateStr)
        .eq("status", "accepted");

      (multipleBookings || []).forEach((bt: { therapist_id: string; booking_id: string; bookings: { booking_time: string; duration: number | null; status: string } }) => {
        if (isExcludedStatus(bt.bookings.status)) return;
        if (excludeBookingId && bt.booking_id === excludeBookingId) return;
        const bStart = timeToMinutes(bt.bookings.booking_time);
        const bEnd = bStart + (bt.bookings.duration || 60) + turnoverBuffer;
        if (bStart < requestedEnd && bEnd > requestedStart) busyTherapistIds.add(bt.therapist_id);
      });

      let filtered = venueTherapists;

      // 5. Filtre par compétences (case-insensitive)
      if (sortedTreatmentIds.length > 0) {
        const { data: treatmentRows } = await supabase
          .from("treatment_menus")
          .select("treatment_type")
          .in("id", sortedTreatmentIds);

        const requiredTypes = new Set(
          (treatmentRows || [])
            .map((r) => r.treatment_type?.toLowerCase())
            .filter((t): t is string => !!t),
        );

        if (requiredTypes.size > 0) {
          filtered = filtered.filter((therapist) => {
            const skills = (therapist.skills || []).map((s) => s.toLowerCase());
            return [...requiredTypes].every((type) => skills.includes(type));
          });
        }
      }

      // 6. Disponibilité déclarée (therapist_availability) — strictement déclarative :
      // sans déclaration pour le jour, le thérapeute n'est PAS considéré disponible
      // (contrairement au moteur de créneaux edge). Fail-open sur erreur de requête.
      const { data: dayAvailability } = await supabase
        .from("therapist_availability")
        .select("therapist_id, is_available, shifts")
        .eq("date", dateStr)
        .in("therapist_id", filtered.map((t) => t.id));

      const availabilityByTherapist = new Map(
        (dayAvailability || []).map((row) => [row.therapist_id, row]),
      );

      type Shift = { start: string; end: string };
      const declaredAvailability = (id: string): { open: boolean; shiftEnd: string | null } => {
        const row = availabilityByTherapist.get(id);
        if (!row || row.is_available === false) return { open: false, shiftEnd: null };
        const shifts = Array.isArray(row.shifts) ? (row.shifts as Shift[]) : [];
        if (shifts.length === 0) return { open: true, shiftEnd: null };
        const shift = shifts.find(
          (s) =>
            s?.start && s?.end &&
            timeToMinutes(s.start) <= requestedStart &&
            requestedStart < timeToMinutes(s.end),
        );
        if (!shift) return { open: false, shiftEnd: null };
        // Le soin déborde du shift (buffer de rotation exclu) : dispo pour le début, pas la fin.
        const overflows = requestedStart + durationMinutes > timeToMinutes(shift.end);
        return { open: true, shiftEnd: overflows ? shift.end.slice(0, 5) : null };
      };

      const annotated: SlotTherapist[] = filtered.map((t) => {
        const { open, shiftEnd } = declaredAvailability(t.id);
        const isAvailableForSlot = open && !busyTherapistIds.has(t.id);
        return {
          ...t,
          isAvailableForSlot,
          shiftEndsBeforeSlotEnd: isAvailableForSlot ? shiftEnd : null,
        };
      });

      return annotated.sort((a, b) =>
        a.isAvailableForSlot === b.isAvailableForSlot
          ? a.first_name.localeCompare(b.first_name)
          : a.isAvailableForSlot ? -1 : 1,
      );
    },
  });
}