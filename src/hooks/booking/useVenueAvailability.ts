import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Shift {
  start: string;
  end: string;
}

export interface DaySummary {
  date: string;
  availableTherapistCount: number;
  totalTherapistCount: number;
  coverageGaps: string[];
}

export type AvailabilityLevel = "full" | "low" | "none" | "blocked";

export interface HourAvailability {
  hour: number;
  availableTherapistCount: number;
  level: AvailabilityLevel;
}

export interface VenueAvailabilityData {
  daySummaries: Map<string, DaySummary>;
  hourAvailability: Map<string, HourAvailability[]>;
  totalRooms: number;
  totalTherapists: number;
  isLoading: boolean;
}

interface BlockedSlot {
  start_time: string;
  end_time: string;
  days_of_week: number[] | null;
  is_active: boolean;
}

interface UseVenueAvailabilityOptions {
  venueId: string;
  weekDays: Date[];
  openingHour?: number;
  closingHour?: number;
}

function timeToMinutes(time: string | undefined | null): number {
  if (!time) return 0;
  const parts = time.split(":").map(Number);
  return parts[0] * 60 + (parts[1] || 0);
}

function isHourBlocked(hour: number, blockedSlots: BlockedSlot[], dayOfWeek: number): boolean {
  const hourStart = hour * 60;
  const hourEnd = (hour + 1) * 60;

  return blockedSlots.some((block) => {
    if (block.days_of_week !== null && !block.days_of_week.includes(dayOfWeek)) {
      return false;
    }
    const blockStart = timeToMinutes(block.start_time);
    const blockEnd = timeToMinutes(block.end_time);
    return hourStart < blockEnd && hourEnd > blockStart;
  });
}

export function useVenueAvailability({
  venueId,
  weekDays,
  openingHour = 7,
  closingHour = 24,
}: UseVenueAvailabilityOptions): VenueAvailabilityData {
  const startDate = weekDays.length > 0 ? format(weekDays[0], "yyyy-MM-dd") : "";
  const endDate = weekDays.length > 0 ? format(weekDays[weekDays.length - 1], "yyyy-MM-dd") : "";

  // Query 1: Therapists linked to this venue
  const { data: venueTherapists } = useQuery({
    queryKey: ["venue-therapists-availability", venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from("therapist_venues")
        .select(`
          therapist_id,
          therapists!inner(id, status)
        `)
        .eq("hotel_id", venueId);

      const activeStatuses = ["active", "actif"];
      return (data || [])
        .filter((t: any) => activeStatuses.includes(t.therapists?.status?.toLowerCase()))
        .map((t: any) => t.therapist_id as string);
    },
    staleTime: 60_000,
    enabled: !!venueId,
  });

  const therapistIds = venueTherapists || [];

  // Query 2: Therapist availability for the date range
  // Include therapistIds in queryKey so it refetches when therapist list changes
  const { data: availabilityData, isLoading: isLoadingAvailability } = useQuery({
    queryKey: ["venue-therapist-availability", venueId, startDate, endDate, therapistIds],
    queryFn: async () => {
      if (therapistIds.length === 0) return [];

      const { data } = await supabase
        .from("therapist_availability")
        .select("therapist_id, date, is_available, shifts")
        .in("therapist_id", therapistIds)
        .gte("date", startDate)
        .lte("date", endDate);

      return (data || []).map((d: any) => ({
        therapist_id: d.therapist_id as string,
        date: d.date as string,
        is_available: d.is_available as boolean,
        shifts: (Array.isArray(d.shifts) ? d.shifts : []) as Shift[],
      }));
    },
    staleTime: 30_000,
    enabled: !!venueId && !!startDate && therapistIds.length > 0,
  });

  // Query 3: Treatment rooms count
  const { data: roomCount } = useQuery({
    queryKey: ["venue-rooms-count", venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from("treatment_rooms")
        .select("id")
        .eq("hotel_id", venueId)
        .in("status", ["active", "Actif"]);

      return data?.length || 0;
    },
    staleTime: 60_000,
    enabled: !!venueId,
  });

  // Query 4: Blocked slots
  const { data: blockedSlots } = useQuery({
    queryKey: ["venue-blocked-slots", venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from("venue_blocked_slots")
        .select("start_time, end_time, days_of_week, is_active")
        .eq("hotel_id", venueId)
        .eq("is_active", true);

      return (data || []) as BlockedSlot[];
    },
    staleTime: 60_000,
    enabled: !!venueId,
  });

  // Compute availability maps
  const { daySummaries, hourAvailability } = useMemo(() => {
    const summaries = new Map<string, DaySummary>();
    const hourMap = new Map<string, HourAvailability[]>();

    if (!weekDays.length || therapistIds.length === 0) {
      return { daySummaries: summaries, hourAvailability: hourMap };
    }

    // Build per-date schedule map: date -> therapist_id -> { is_available, shifts }
    const scheduleByDate = new Map<string, Map<string, { is_available: boolean; shifts: Shift[] }>>();
    (availabilityData || []).forEach((entry) => {
      if (!scheduleByDate.has(entry.date)) {
        scheduleByDate.set(entry.date, new Map());
      }
      scheduleByDate.get(entry.date)!.set(entry.therapist_id, {
        is_available: entry.is_available,
        shifts: entry.shifts,
      });
    });

    for (const day of weekDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayOfWeek = day.getDay(); // 0=Sun, 1=Mon, ...
      const dateSchedule = scheduleByDate.get(dateStr);

      // Count available therapists for this day
      let availableCount = 0;
      const availableTherapistsForDay: { id: string; shifts: Shift[] }[] = [];

      for (const tId of therapistIds) {
        const schedule = dateSchedule?.get(tId);
        if (!schedule) {
          // Backward compat: no data = available all day
          availableCount++;
          availableTherapistsForDay.push({ id: tId, shifts: [] });
        } else if (schedule.is_available) {
          availableCount++;
          availableTherapistsForDay.push({ id: tId, shifts: schedule.shifts });
        }
      }

      // Compute per-hour availability
      const hours: HourAvailability[] = [];
      const gaps: string[] = [];

      for (let hour = openingHour; hour < closingHour; hour++) {
        // Check blocked slots
        if (blockedSlots && isHourBlocked(hour, blockedSlots, dayOfWeek)) {
          hours.push({ hour, availableTherapistCount: 0, level: "blocked" });
          continue;
        }

        // Count therapists with shifts covering this hour
        const hourStart = hour * 60;
        let therapistsThisHour = 0;

        for (const t of availableTherapistsForDay) {
          if (t.shifts.length === 0) {
            // No shift data = available all day (backward compat)
            therapistsThisHour++;
          } else {
            const covers = t.shifts.some((shift) => {
              if (!shift.start || !shift.end) return false;
              const shiftStart = timeToMinutes(shift.start);
              const shiftEnd = timeToMinutes(shift.end);
              return hourStart >= shiftStart && hourStart < shiftEnd;
            });
            if (covers) therapistsThisHour++;
          }
        }

        let level: AvailabilityLevel;
        if (therapistsThisHour === 0) {
          level = "none";
          gaps.push(`${hour.toString().padStart(2, "0")}:00`);
        } else if (therapistsThisHour === 1) {
          level = "low";
        } else {
          level = "full";
        }

        hours.push({ hour, availableTherapistCount: therapistsThisHour, level });
      }

      summaries.set(dateStr, {
        date: dateStr,
        availableTherapistCount: availableCount,
        totalTherapistCount: therapistIds.length,
        coverageGaps: gaps,
      });

      hourMap.set(dateStr, hours);
    }

    return { daySummaries: summaries, hourAvailability: hourMap };
  }, [weekDays, therapistIds, availabilityData, blockedSlots, openingHour, closingHour]);

  return {
    daySummaries,
    hourAvailability,
    totalRooms: roomCount || 0,
    totalTherapists: therapistIds.length,
    isLoading: isLoadingAvailability,
  };
}
