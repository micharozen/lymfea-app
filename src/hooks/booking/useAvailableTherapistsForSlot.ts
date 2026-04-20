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
}

interface UseAvailableTherapistsForSlotParams {
  hotelId: string | undefined;
  date: Date | undefined;
  time: string;
  durationMinutes: number;
  treatmentIds?: string[];
}

const ACTIVE_STATUSES = ["Actif", "active", "Active"];
const EXCLUDED_BOOKING_STATUSES = new Set([
  "Annulé",
  "cancelled",
  "canceled",
  "Terminé",
  "completed",
  "no_show",
]);

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

      // Fetch room turnover buffer for this venue
      const { data: hotelSettings } = await supabase
        .from("hotels")
        .select("room_turnover_buffer_minutes, inter_venue_buffer_minutes")
        .eq("id", hotelId)
        .single();
      const turnoverBuffer = hotelSettings?.room_turnover_buffer_minutes ?? 0;
      const travelBuffer = hotelSettings?.inter_venue_buffer_minutes ?? 0;

      const { data: links, error: linksError } = await supabase
        .from("therapist_venues")
        .select("therapist_id, therapists (id, first_name, last_name, profile_image, skills, status)")
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
      (sameDayBookings || []).forEach((b) => {
        if (!b.therapist_id) return;
        if (EXCLUDED_BOOKING_STATUSES.has(b.status)) return;
        const bStart = timeToMinutes(b.booking_time);
        const bEnd = bStart + (b.duration || 60) + turnoverBuffer;
        const overlaps = bStart < requestedEnd && bEnd > requestedStart;
        if (overlaps) busyTherapistIds.add(b.therapist_id);
      });

      // Cross-venue travel buffer: block therapists who have bookings at other venues
      if (travelBuffer > 0) {
        const therapistIds = venueTherapists.map((t) => t.id);
        const { data: crossVenueBookings } = await supabase
          .from("bookings")
          .select("therapist_id, booking_time, duration, status")
          .eq("booking_date", dateStr)
          .neq("hotel_id", hotelId)
          .in("therapist_id", therapistIds)
          .not("status", "in", '("Annulé","Terminé","cancelled")');

        (crossVenueBookings || []).forEach((b) => {
          if (!b.therapist_id || EXCLUDED_BOOKING_STATUSES.has(b.status)) return;
          const bStart = timeToMinutes(b.booking_time);
          const bEnd = bStart + (b.duration || 60);
          if (requestedStart < bEnd + travelBuffer && requestedStart + durationMinutes > bStart - travelBuffer) {
            busyTherapistIds.add(b.therapist_id);
          }
        });
      }

      let filtered = venueTherapists.filter((t) => !busyTherapistIds.has(t.id));

      // Filter by skills: only keep therapists whose skills cover all required treatment types
      if (sortedTreatmentIds.length > 0) {
        const { data: treatmentRows } = await supabase
          .from("treatment_menus")
          .select("treatment_type")
          .in("id", sortedTreatmentIds);

        const requiredTypes = new Set(
          (treatmentRows || [])
            .map((r) => r.treatment_type)
            .filter((t): t is string => !!t),
        );

        if (requiredTypes.size > 0) {
          filtered = filtered.filter((therapist) => {
            const skills = therapist.skills || [];
            return [...requiredTypes].every((type) => skills.includes(type));
          });
        }
      }

      return filtered.sort((a, b) => a.first_name.localeCompare(b.first_name));
    },
  });
}
