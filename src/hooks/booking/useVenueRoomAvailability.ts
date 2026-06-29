import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_BOOKING_STATUS_FILTER,
  computeSlotCapacity,
  timeToMinutes,
  type TherapistShift,
} from "@shared/availability";

export interface SlotBedAvailability {
  time: string;
  slotMinutes: number;
  freeBeds: number;
  totalBeds: number;
}

export interface RoomDaySummary {
  date: string;
  minFreeBeds: number;
  totalBeds: number;
}

export interface VenueRoomAvailabilityData {
  slotBedAvailability: Map<string, SlotBedAvailability[]>;
  daySummaries: Map<string, RoomDaySummary>;
  totalBeds: number;
  slotInterval: number;
  openingMinutes: number;
  closingMinutes: number;
  isLoading: boolean;
}

interface BlockedSlot {
  start_time: string;
  end_time: string;
  days_of_week: number[] | null;
}

interface UseVenueRoomAvailabilityOptions {
  venueId: string;
  weekDays: Date[];
}

interface TherapistSchedule {
  is_available: boolean;
  shifts: TherapistShift[];
}

export function useVenueRoomAvailability({
  venueId,
  weekDays,
}: UseVenueRoomAvailabilityOptions): VenueRoomAvailabilityData {
  const startDate = weekDays.length > 0 ? format(weekDays[0], "yyyy-MM-dd") : "";
  const endDate = weekDays.length > 0 ? format(weekDays[weekDays.length - 1], "yyyy-MM-dd") : "";

  const { data: venueConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["venue-room-config", venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hotels")
        .select("opening_time, closing_time, slot_interval, room_turnover_buffer_minutes, inter_venue_buffer_minutes")
        .eq("id", venueId)
        .single();
      return data;
    },
    staleTime: 60_000,
    enabled: !!venueId,
  });

  const { data: rooms, isLoading: isLoadingRooms } = useQuery({
    queryKey: ["venue-rooms-capacity", venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from("treatment_rooms")
        .select("id, capacity")
        .eq("hotel_id", venueId)
        .in("status", ["active", "Actif"]);
      return (data || []).map((r) => ({ id: r.id as string, capacity: (r.capacity as number) || 1 }));
    },
    staleTime: 60_000,
    enabled: !!venueId,
  });

  const { data: therapistIds = [] } = useQuery({
    queryKey: ["venue-therapists-availability", venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from("therapist_venues")
        .select("therapist_id, therapists!inner(id, status)")
        .eq("hotel_id", venueId);
      const activeStatuses = ["active", "actif"];
      return (data || [])
        .filter((t: { therapists?: { status?: string } }) =>
          activeStatuses.includes(t.therapists?.status?.toLowerCase() ?? "")
        )
        .map((t: { therapist_id: string }) => t.therapist_id);
    },
    staleTime: 60_000,
    enabled: !!venueId,
  });

  const { data: availabilityRows, isLoading: isLoadingSchedules } = useQuery({
    queryKey: ["venue-therapist-availability", venueId, startDate, endDate, therapistIds],
    queryFn: async () => {
      if (therapistIds.length === 0) return [];
      const { data } = await supabase
        .from("therapist_availability")
        .select("therapist_id, date, is_available, shifts")
        .in("therapist_id", therapistIds)
        .gte("date", startDate)
        .lte("date", endDate);
      return (data || []).map((d) => ({
        therapist_id: d.therapist_id as string,
        date: d.date as string,
        is_available: d.is_available as boolean,
        shifts: (Array.isArray(d.shifts) ? d.shifts : []) as TherapistShift[],
      }));
    },
    staleTime: 30_000,
    enabled: !!venueId && !!startDate && therapistIds.length > 0,
  });

  const { data: bookings, isLoading: isLoadingBookings } = useQuery({
    queryKey: ["venue-room-bookings", venueId, startDate, endDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("booking_date, booking_time, therapist_id, room_id, duration, guest_count")
        .eq("hotel_id", venueId)
        .gte("booking_date", startDate)
        .lte("booking_date", endDate)
        .not("status", "in", ACTIVE_BOOKING_STATUS_FILTER);
      return data || [];
    },
    staleTime: 30_000,
    enabled: !!venueId && !!startDate,
  });

  const travelBuffer = venueConfig?.inter_venue_buffer_minutes ?? 0;

  const { data: crossVenueBookings } = useQuery({
    queryKey: ["venue-cross-bookings", venueId, startDate, endDate, therapistIds, travelBuffer],
    queryFn: async () => {
      if (therapistIds.length === 0 || travelBuffer <= 0) return [];
      const { data } = await supabase
        .from("bookings")
        .select("booking_date, booking_time, therapist_id, duration")
        .in("therapist_id", therapistIds)
        .neq("hotel_id", venueId)
        .gte("booking_date", startDate)
        .lte("booking_date", endDate)
        .not("status", "in", ACTIVE_BOOKING_STATUS_FILTER);
      return data || [];
    },
    staleTime: 30_000,
    enabled: !!venueId && !!startDate && therapistIds.length > 0 && travelBuffer > 0,
  });

  const { data: blockedSlots } = useQuery({
    queryKey: ["venue-blocked-slots", venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from("venue_blocked_slots")
        .select("start_time, end_time, days_of_week")
        .eq("hotel_id", venueId)
        .eq("is_active", true);
      return (data || []) as BlockedSlot[];
    },
    staleTime: 60_000,
    enabled: !!venueId,
  });

  const slotInterval = venueConfig?.slot_interval || 30;
  const roomTurnoverBuffer = venueConfig?.room_turnover_buffer_minutes ?? 0;
  const openingMinutes = venueConfig?.opening_time
    ? timeToMinutes(venueConfig.opening_time)
    : 6 * 60;
  const closingMinutes = venueConfig?.closing_time
    ? timeToMinutes(venueConfig.closing_time)
    : 23 * 60;

  const { slotBedAvailability, daySummaries, totalBeds } = useMemo(() => {
    const slotMap = new Map<string, SlotBedAvailability[]>();
    const summaryMap = new Map<string, RoomDaySummary>();
    const roomList = rooms || [];
    const bedsTotal = roomList.reduce((sum, r) => sum + (r.capacity || 1), 0);

    if (!weekDays.length || roomList.length === 0) {
      return { slotBedAvailability: slotMap, daySummaries: summaryMap, totalBeds: bedsTotal };
    }

    const timeSlots: string[] = [];
    for (let m = openingMinutes; m < closingMinutes; m += slotInterval) {
      timeSlots.push(
        `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}:00`,
      );
    }

    const isSlotInBlockedRange = (slot: string, dow: number): boolean => {
      if (!blockedSlots || blockedSlots.length === 0) return false;
      const s = timeToMinutes(slot);
      const e = s + slotInterval;
      return blockedSlots.some((b) => {
        if (b.days_of_week !== null && !b.days_of_week.includes(dow)) return false;
        return s < timeToMinutes(b.end_time) && e > timeToMinutes(b.start_time);
      });
    };

    const scheduleByDate = new Map<string, Map<string, TherapistSchedule>>();
    (availabilityRows || []).forEach((entry) => {
      if (!scheduleByDate.has(entry.date)) scheduleByDate.set(entry.date, new Map());
      scheduleByDate.get(entry.date)!.set(entry.therapist_id, {
        is_available: entry.is_available,
        shifts: entry.shifts,
      });
    });

    const bookingsByDate = new Map<string, typeof bookings>();
    (bookings || []).forEach((b) => {
      const date = b.booking_date as string;
      if (!bookingsByDate.has(date)) bookingsByDate.set(date, []);
      bookingsByDate.get(date)!.push(b);
    });

    const crossByDate = new Map<string, NonNullable<typeof crossVenueBookings>>();
    (crossVenueBookings || []).forEach((b) => {
      const date = b.booking_date as string;
      if (!crossByDate.has(date)) crossByDate.set(date, []);
      crossByDate.get(date)!.push(b);
    });

    for (const day of weekDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      const dow = day.getDay();
      const dateBookings = bookingsByDate.get(dateStr) || [];
      const crossBookings = crossByDate.get(dateStr) || [];
      const scheduleMap = scheduleByDate.get(dateStr);

      const scheduledTherapistIds = therapistIds.filter((id) => {
        const s = scheduleMap?.get(id);
        return s ? s.is_available : true;
      });

      const scheduleByTherapist = new Map<string, { shifts: TherapistShift[] }>();
      if (scheduleMap) {
        for (const [tid, s] of scheduleMap.entries()) {
          scheduleByTherapist.set(tid, { shifts: s.shifts });
        }
      }

      const slots: SlotBedAvailability[] = [];
      let minFree = bedsTotal;

      for (const slot of timeSlots) {
        if (isSlotInBlockedRange(slot, dow)) continue;
        if (timeToMinutes(slot) + slotInterval > closingMinutes) continue;

        const { rooms: freeBeds } = computeSlotCapacity({
          slot,
          requestedDuration: slotInterval,
          roomTurnoverBuffer,
          rooms: roomList,
          bookings: dateBookings.map((b) => ({
            booking_time: b.booking_time as string,
            therapist_id: (b.therapist_id as string | null) ?? null,
            room_id: (b.room_id as string | null) ?? null,
            duration: b.duration as number | null,
            guest_count: b.guest_count as number | null,
          })),
          pendingHolds: [],
          scheduledTherapistIds,
          scheduleByTherapist,
          crossVenueBookings: crossBookings.map((b) => ({
            therapist_id: (b.therapist_id as string | null) ?? null,
            booking_time: b.booking_time as string,
            duration: b.duration as number | null,
          })),
          travelBuffer,
          requiredGuestCount: 1,
        });

        const clampedFree = Math.max(0, Math.min(freeBeds, bedsTotal));
        minFree = Math.min(minFree, clampedFree);

        slots.push({
          time: slot,
          slotMinutes: timeToMinutes(slot),
          freeBeds: clampedFree,
          totalBeds: bedsTotal,
        });
      }

      slotMap.set(dateStr, slots);
      summaryMap.set(dateStr, {
        date: dateStr,
        minFreeBeds: slots.length > 0 ? minFree : bedsTotal,
        totalBeds: bedsTotal,
      });
    }

    return { slotBedAvailability: slotMap, daySummaries: summaryMap, totalBeds: bedsTotal };
  }, [
    weekDays,
    rooms,
    bookings,
    crossVenueBookings,
    availabilityRows,
    therapistIds,
    blockedSlots,
    slotInterval,
    roomTurnoverBuffer,
    openingMinutes,
    closingMinutes,
    travelBuffer,
  ]);

  return {
    slotBedAvailability,
    daySummaries,
    totalBeds,
    slotInterval,
    openingMinutes,
    closingMinutes,
    isLoading: isLoadingConfig || isLoadingRooms || isLoadingBookings || isLoadingSchedules,
  };
}
