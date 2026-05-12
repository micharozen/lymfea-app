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

interface UseAvailableTherapistsForSlotParams {
  hotelId: string | undefined;
  date: Date | undefined;
  time: string;
  durationMinutes: number;
  treatmentIds?: string[];
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
}: UseAvailableTherapistsForSlotParams) {
  const dateStr = date ? format(date, "yyyy-MM-dd") : "";
  const enabled = !!hotelId && !!dateStr && !!time && durationMinutes > 0;
  const sortedTreatmentIds = [...(treatmentIds || [])].sort();

  return useQuery({
    queryKey: ["available-therapists-for-slot", hotelId, dateStr, time, durationMinutes, sortedTreatmentIds],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AvailableTherapist[]> => {
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
        .select("therapist_id, booking_time, duration, status")
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
        const bStart = timeToMinutes(b.booking_time);
        const bEnd = bStart + (b.duration || 60) + turnoverBuffer;
        if (bStart < requestedEnd && bEnd > requestedStart) busyTherapistIds.add(b.therapist_id);
      });

      // 4. Vérifier aussi la table booking_therapists (soins duo)
      const { data: multipleBookings } = await supabase
        .from("booking_therapists")
        .select("therapist_id, bookings!inner(booking_time, duration, status, booking_date)")
        .eq("bookings.booking_date", dateStr)
        .eq("status", "accepted");

      (multipleBookings || []).forEach((bt: { therapist_id: string; bookings: { booking_time: string; duration: number | null; status: string } }) => {
        if (isExcludedStatus(bt.bookings.status)) return;
        const bStart = timeToMinutes(bt.bookings.booking_time);
        const bEnd = bStart + (bt.bookings.duration || 60) + turnoverBuffer;
        if (bStart < requestedEnd && bEnd > requestedStart) busyTherapistIds.add(bt.therapist_id);
      });

      let filtered = venueTherapists.filter((t) => !busyTherapistIds.has(t.id));

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

      return filtered.sort((a, b) => a.first_name.localeCompare(b.first_name));
    },
  });
}