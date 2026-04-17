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
}: UseAvailableTherapistsForSlotParams) {
  const dateStr = date ? format(date, "yyyy-MM-dd") : "";
  const enabled = !!hotelId && !!dateStr && !!time && durationMinutes > 0;

  return useQuery({
    queryKey: ["available-therapists-for-slot", hotelId, dateStr, time, durationMinutes],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AvailableTherapist[]> => {
      if (!hotelId || !dateStr || !time) return [];

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
      const requestedEnd = requestedStart + durationMinutes;

      const busyTherapistIds = new Set<string>();
      (sameDayBookings || []).forEach((b) => {
        if (!b.therapist_id) return;
        if (EXCLUDED_BOOKING_STATUSES.has(b.status)) return;
        const bStart = timeToMinutes(b.booking_time);
        const bEnd = bStart + (b.duration || 60);
        const overlaps = bStart < requestedEnd && bEnd > requestedStart;
        if (overlaps) busyTherapistIds.add(b.therapist_id);
      });

      return venueTherapists
        .filter((t) => !busyTherapistIds.has(t.id))
        .sort((a, b) => a.first_name.localeCompare(b.first_name));
    },
  });
}
