// Venue availability orchestration — the single source of truth for slot
// computation. Loads venue config, therapists, rooms, schedules and bookings
// once, then evaluates each requested date with the shared `isSlotAvailable`
// rules. Used by the `get-availability` edge function for both the single-date
// mode (return every free slot of a day) and the range mode (which days have
// at least one free slot).
//
// Merged from the former `check-availability` and `check-availability-range`
// functions so the two stay impossible to diverge — including the
// skills/category qualification filter that previously only lived in the
// single-date function.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  ACTIVE_BOOKING_STATUS_FILTER,
  computeSlotCapacity,
  filterQualifiedTherapists,
  timeToMinutes,
  type TherapistShift,
} from "./availability.ts";

export interface VenueAvailabilityOptions {
  /** Selected treatments — drive duration, lead time and therapist qualification. */
  treatmentIds?: string[];
  /** Explicit overlap duration (minutes). Falls back to max treatment duration → slot interval. */
  requestedDuration?: number | null;
  therapistGender?: string;
  requiredGuestCount?: number;
  /** Single-date mode only: exclude a booking being edited from the capacity check. */
  excludeBookingId?: string;
  /** In-cart slots not yet persisted; each consumes 1 room + 1 therapist on its date. */
  pendingHolds?: Array<{ date: string; time: string; duration: number }>;
}

export interface SlotInfo {
  /** Venue-local start time, "HH:MM:SS". */
  time: string;
  /** True when the slot starts outside the venue's posted opening hours (surcharged). */
  outOfHours: boolean;
  /** Simultaneous bookings still possible at this slot = min(free rooms, free therapists). */
  capacity: number;
}

export interface VenueAvailabilityResult {
  /** date (YYYY-MM-DD, venue-local) → available slots. Only deployed dates appear. */
  slotsByDate: Map<string, SlotInfo[]>;
  /** Subset of the requested dates on which the venue is deployed. */
  deployedDates: Set<string>;
}

/**
 * Compute available slots for a venue across a set of venue-local dates.
 *
 * The returned `slotsByDate` contains an entry only for deployed dates; a
 * deployed-but-fully-booked date maps to an empty array. Callers distinguish
 * "not deployed" from "no slots" via `deployedDates`.
 */
export async function getVenueAvailability(
  supabase: SupabaseClient,
  hotelId: string,
  dates: string[],
  opts: VenueAvailabilityOptions = {},
): Promise<VenueAvailabilityResult> {
  const slotsByDate = new Map<string, SlotInfo[]>();
  const requiredGuestCount = Math.max(1, opts.requiredGuestCount || 1);

  if (dates.length === 0) {
    return { slotsByDate, deployedDates: new Set() };
  }

  const sorted = [...dates].sort();
  const rangeStart = sorted[0];
  const rangeEnd = sorted[sorted.length - 1];

  // 1. Deployment: which of the requested dates is the venue actually open on.
  const { data: deployed, error: deployedErr } = await supabase.rpc(
    "get_venue_available_dates",
    { _hotel_id: hotelId, _start_date: rangeStart, _end_date: rangeEnd },
  );
  if (deployedErr) console.error("get_venue_available_dates error:", deployedErr);
  const deployedDates = new Set<string>((deployed as string[] | null) || []);
  const activeDates = dates.filter((d) => deployedDates.has(d));
  if (activeDates.length === 0) return { slotsByDate, deployedDates };

  // 2. Venue config.
  const { data: hotelData } = await supabase
    .from("hotels")
    .select(
      "opening_time, closing_time, slot_interval, inter_venue_buffer_minutes, room_turnover_buffer_minutes, min_booking_notice_minutes, timezone, allow_out_of_hours_booking",
    )
    .eq("id", hotelId)
    .single();

  const baseOpening = hotelData?.opening_time
    ? timeToMinutes(hotelData.opening_time)
    : 6 * 60;
  const baseClosing = hotelData?.closing_time
    ? timeToMinutes(hotelData.closing_time)
    : 23 * 60;
  // Out-of-hours bookings widen the generation window by ±2h (surcharge applied downstream).
  const allowOutOfHours = !!hotelData?.allow_out_of_hours_booking;
  const openingMinutes = allowOutOfHours ? Math.max(0, baseOpening - 120) : baseOpening;
  const closingMinutes = allowOutOfHours ? Math.min(24 * 60, baseClosing + 120) : baseClosing;
  const slotInterval = hotelData?.slot_interval || 30;
  const roomTurnoverBuffer = hotelData?.room_turnover_buffer_minutes ?? 0;
  const travelBuffer = hotelData?.inter_venue_buffer_minutes ?? 0;
  const minBookingNotice = hotelData?.min_booking_notice_minutes ?? 0;
  const venueTz = hotelData?.timezone || "UTC";

  // 3. Treatments → max lead time, max duration, required skill categories.
  let maxTreatmentLeadTime = 0;
  let maxTreatmentDuration = 0;
  const requiredCategories = new Set<string>();
  if (opts.treatmentIds && opts.treatmentIds.length > 0) {
    const { data: treatments } = await supabase
      .from("treatment_menus")
      .select("lead_time, treatment_type, duration")
      .in("id", opts.treatmentIds);
    if (treatments && treatments.length > 0) {
      maxTreatmentLeadTime = Math.max(...treatments.map((t: any) => t.lead_time || 0));
      maxTreatmentDuration = Math.max(...treatments.map((t: any) => t.duration || 0));
      treatments.forEach((t: any) => {
        if (t.treatment_type) requiredCategories.add(t.treatment_type);
      });
    }
  }
  // Venue min booking notice applies even without selected treatments.
  const maxLeadTime = Math.max(maxTreatmentLeadTime, minBookingNotice);
  const requestedDuration =
    (typeof opts.requestedDuration === "number" && opts.requestedDuration > 0
      ? opts.requestedDuration
      : null) ?? (maxTreatmentDuration || slotInterval);

  // 4. Therapists: active + optional gender + skill qualification.
  let therapistQuery = supabase
    .from("therapist_venues")
    .select("therapist_id, therapists!inner(id, status, skills, gender)")
    .eq("hotel_id", hotelId);
  if (opts.therapistGender) {
    therapistQuery = therapistQuery.eq("therapists.gender", opts.therapistGender);
  }
  const { data: therapistRows } = await therapistQuery;
  const activeTherapists = (therapistRows || []).filter((h: any) => {
    const s = h.therapists?.status?.toLowerCase();
    return s === "active" || s === "actif";
  });
  const qualifiedTherapists = filterQualifiedTherapists(
    activeTherapists.map((h: any) => ({ therapist_id: h.therapist_id, skills: h.therapists?.skills ?? null })),
    requiredCategories,
  );
  const therapistIds = qualifiedTherapists.map((h) => h.therapist_id);

  // 5. Rooms with capacity.
  const { data: treatmentRooms } = await supabase
    .from("treatment_rooms")
    .select("id, capacity")
    .eq("hotel_id", hotelId)
    .in("status", ["active", "Actif"]);
  const rooms = (treatmentRooms || []).map((r: any) => ({ id: r.id, capacity: r.capacity || 1 }));

  // No rooms or no qualified therapists → every deployed date is empty.
  if (rooms.length === 0 || therapistIds.length === 0) {
    for (const d of activeDates) slotsByDate.set(d, []);
    return { slotsByDate, deployedDates };
  }

  // 6. Therapist schedules over the range.
  const { data: availabilityRows } = await supabase
    .from("therapist_availability")
    .select("therapist_id, date, is_available, shifts")
    .gte("date", rangeStart)
    .lte("date", rangeEnd)
    .in("therapist_id", therapistIds);
  type Schedule = { is_available: boolean; shifts: TherapistShift[] };
  const scheduleByDate = new Map<string, Map<string, Schedule>>();
  (availabilityRows || []).forEach((s: any) => {
    if (!scheduleByDate.has(s.date)) scheduleByDate.set(s.date, new Map());
    scheduleByDate.get(s.date)!.set(s.therapist_id, {
      is_available: s.is_available,
      shifts: Array.isArray(s.shifts) ? s.shifts : [],
    });
  });

  // 7. Bookings over the range (optionally excluding the one being edited).
  let bookingsQuery = supabase
    .from("bookings")
    .select("booking_date, booking_time, therapist_id, status, room_id, duration, guest_count")
    .eq("hotel_id", hotelId)
    .gte("booking_date", rangeStart)
    .lte("booking_date", rangeEnd)
    .not("status", "in", ACTIVE_BOOKING_STATUS_FILTER);
  if (opts.excludeBookingId) bookingsQuery = bookingsQuery.neq("id", opts.excludeBookingId);
  const { data: hotelBookings } = await bookingsQuery;
  const bookingsByDate = new Map<string, any[]>();
  (hotelBookings || []).forEach((b: any) => {
    if (!bookingsByDate.has(b.booking_date)) bookingsByDate.set(b.booking_date, []);
    bookingsByDate.get(b.booking_date)!.push(b);
  });

  // 8. Cross-venue bookings (only when a travel buffer is configured).
  const crossVenueByDate = new Map<string, any[]>();
  if (travelBuffer > 0) {
    const { data: crossData } = await supabase
      .from("bookings")
      .select("booking_date, booking_time, therapist_id, duration, hotel_id")
      .in("therapist_id", therapistIds)
      .neq("hotel_id", hotelId)
      .gte("booking_date", rangeStart)
      .lte("booking_date", rangeEnd)
      .not("status", "in", ACTIVE_BOOKING_STATUS_FILTER);
    (crossData || []).forEach((b: any) => {
      if (!crossVenueByDate.has(b.booking_date)) crossVenueByDate.set(b.booking_date, []);
      crossVenueByDate.get(b.booking_date)!.push(b);
    });
  }

  // 9. Blocked slots (lunch breaks, maintenance…). Fetched once.
  const { data: blockedSlots } = await supabase
    .from("venue_blocked_slots")
    .select("start_time, end_time, days_of_week")
    .eq("hotel_id", hotelId)
    .eq("is_active", true);
  const isSlotInBlockedRange = (slot: string, dow: number): boolean => {
    if (!blockedSlots || blockedSlots.length === 0) return false;
    const s = timeToMinutes(slot);
    const e = s + slotInterval;
    return blockedSlots.some((b: any) => {
      if (b.days_of_week !== null && !b.days_of_week.includes(dow)) return false;
      return s < timeToMinutes(b.end_time) && e > timeToMinutes(b.start_time);
    });
  };

  // 10. Candidate slots (identical every day).
  const timeSlots: string[] = [];
  for (let m = openingMinutes; m < closingMinutes; m += slotInterval) {
    timeSlots.push(
      `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}:00`,
    );
  }

  // 11. "Now" and the lead-time horizon, both expressed in the venue timezone.
  const now = new Date();
  const partsAt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: venueTz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const nowParts = partsAt(now);
  const todayStr = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
  const nowMinutes = parseInt(nowParts.hour, 10) * 60 + parseInt(nowParts.minute, 10);

  const earliestBookableAt = new Date(now.getTime() + maxLeadTime * 60 * 1000);
  const eParts = partsAt(earliestBookableAt);
  const earliestBookableDateStr = `${eParts.year}-${eParts.month}-${eParts.day}`;
  const earliestBookableMinutes = parseInt(eParts.hour, 10) * 60 + parseInt(eParts.minute, 10);
  const roundedEarliest = Math.ceil(earliestBookableMinutes / slotInterval) * slotInterval;

  // 12. Pending holds grouped by date.
  const holdsByDate = new Map<string, Array<{ time: string; duration: number }>>();
  for (const h of opts.pendingHolds || []) {
    if (!holdsByDate.has(h.date)) holdsByDate.set(h.date, []);
    holdsByDate.get(h.date)!.push({ time: h.time, duration: h.duration });
  }

  // 13. Evaluate each deployed date.
  for (const date of activeDates) {
    // Lead time: whole day before the earliest bookable day → no slots.
    if (maxLeadTime > 0 && date < earliestBookableDateStr) {
      slotsByDate.set(date, []);
      continue;
    }
    const earliestSlotMinutes =
      maxLeadTime > 0 && date === earliestBookableDateStr ? roundedEarliest : -1;

    const dow = new Date(date + "T00:00:00").getDay();
    const bookings = bookingsByDate.get(date) || [];
    const crossBookings = crossVenueByDate.get(date) || [];
    const scheduleMap = scheduleByDate.get(date);
    const dateHolds = holdsByDate.get(date) || [];

    // Therapists scheduled for this date (no row = available, transition period).
    const scheduledTherapistIds = therapistIds.filter((id) => {
      const s = scheduleMap?.get(id);
      return s ? s.is_available : true;
    });
    if (scheduledTherapistIds.length === 0) {
      slotsByDate.set(date, []);
      continue;
    }

    const scheduleByTherapist = new Map<string, { shifts: TherapistShift[] }>();
    if (scheduleMap) {
      for (const [tid, s] of scheduleMap.entries()) {
        scheduleByTherapist.set(tid, { shifts: s.shifts });
      }
    }

    const slots: SlotInfo[] = [];
    for (const slot of timeSlots) {
      if (isSlotInBlockedRange(slot, dow)) continue;
      const slotMinutes = timeToMinutes(slot);
      // Never offer a slot in the past for today (venue-local).
      if (date === todayStr && slotMinutes <= nowMinutes) continue;
      if (earliestSlotMinutes >= 0 && slotMinutes < earliestSlotMinutes) continue;
      if (slotMinutes + requestedDuration > closingMinutes) continue;

      const { capacity } = computeSlotCapacity({
        slot,
        requestedDuration,
        roomTurnoverBuffer,
        rooms,
        bookings,
        pendingHolds: dateHolds,
        scheduledTherapistIds,
        scheduleByTherapist,
        crossVenueBookings: crossBookings,
        travelBuffer,
        requiredGuestCount,
      });
      if (capacity < requiredGuestCount) continue;

      slots.push({
        time: slot,
        // Out-of-hours = starts outside the venue's posted (non-widened) hours.
        // Mirrors isOutOfHours() in _shared/surcharge.ts.
        outOfHours: slotMinutes < baseOpening || slotMinutes >= baseClosing,
        capacity,
      });
    }
    slotsByDate.set(date, slots);
  }

  return { slotsByDate, deployedDates };
}

/** Enumerate venue-local YYYY-MM-DD dates from `startDate` to `endDate` inclusive. */
export function enumerateDates(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    out.push(cursor);
    const d = new Date(cursor + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return out;
}
