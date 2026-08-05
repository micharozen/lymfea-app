import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { EXCLUDED_BOOKING_STATUSES } from "./useAvailableTherapistsForSlot";
import { therapistsOfVenue, useVenueTherapists } from "./useVenueTherapists";
import type { BookingWithTreatments } from "./useBookingData";
import type { TherapistLite } from "./useVenueTherapists";

export type { TherapistLite };

/** Half-open minute range from midnight: [startMin, endMin). */
export interface TimeRange {
  startMin: number;
  endMin: number;
}

export interface BlockedRange extends TimeRange {
  id: string;
  label: string;
}

/** Blocage ponctuel daté ciblant une salle de soin précise. */
export interface RoomBlockedRange extends BlockedRange {
  roomId: string;
  roomName: string | null;
}

export interface TherapistDayColumn {
  therapist: TherapistLite;
  /** Declared working ranges for the day. Empty = not working (absent or undeclared). */
  openRanges: TimeRange[];
  /** An absence was recorded (therapist_availability.is_available = false). */
  isAbsent: boolean;
  /** No therapist_availability row at all for that day. */
  hasNoSchedule: boolean;
  /** Performs the searched treatment. Always true when no treatment is searched. */
  isQualified: boolean;
  bookings: BookingWithTreatments[];
}

export interface FreeTherapist {
  therapist: TherapistLite;
  /**
   * The treatment would run past the end of their shift. Not a blocker — both the
   * edge engine and the admin picker only require the *start* to fall inside a
   * shift — but worth flagging before booking it.
   */
  overflowsShift: boolean;
}

export interface HourAvailability {
  hour: number;
  /** Therapists who can take the searched treatment at this hour (or who are simply free). */
  free: FreeTherapist[];
  /** The hour is closed venue-wide (blocked slot). */
  isBlocked: boolean;
}

export interface TherapistDayPlanning {
  columns: TherapistDayColumn[];
  /** Bookings of the day with no therapist attached yet (awaiting broadcast/assignment). */
  unassignedBookings: BookingWithTreatments[];
  blockedRanges: BlockedRange[];
  /** Blocages datés ciblant une salle. Informatifs : les autres salles restent réservables. */
  roomBlockedRanges: RoomBlockedRange[];
  /** hour → who could take the treatment then. Computed over the whole team. */
  availabilityByHour: Map<number, HourAvailability>;
  /** Active therapists attached to the venue, regardless of any filter. */
  totalTherapistCount: number;
  /** Therapists qualified for the searched treatment (= total when none is searched). */
  qualifiedTherapistCount: number;
  /** Columns hidden by the scheduled-only filter. */
  hiddenColumnCount: number;
  isLoading: boolean;
}

export interface Shift {
  start: string;
  end: string;
}

/** The treatment being searched for: drives qualification and the required duration. */
export interface SearchedTreatment {
  id: string;
  duration: number | null;
}

interface UseTherapistDayPlanningOptions {
  venueId: string | null;
  date: Date;
  /**
   * The page's unfiltered booking list — scoping to the venue and the day happens
   * here. Passing pre-filtered bookings (by therapist or status) would silently
   * inflate the free count, since a hidden booking still occupies its therapist.
   */
  bookings: BookingWithTreatments[] | undefined;
  startHour: number;
  endHour: number;
  /** Only keep therapists working that day (Fresha's "scheduled team"). */
  showOnlyScheduled: boolean;
  /** Null = "who is free", set = "who can take this treatment, for its full duration". */
  treatment: SearchedTreatment | null;
}

const ACTIVE_STATUSES = ["active", "actif"];

/** Bookings that never appear on the planning: they occupy nobody and add noise. */
const HIDDEN_BOOKING_STATUSES = ["Annulé", "cancelled", "canceled", "noshow", "no_show"];

export function timeToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** `therapist_availability.shifts` is untyped Json — keep only usable entries. */
export function parseShifts(value: unknown): Shift[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is Shift =>
      !!s && typeof s === "object" &&
      typeof (s as Shift).start === "string" &&
      typeof (s as Shift).end === "string",
  );
}

/** Half-open overlap: two ranges share at least one minute. */
function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startMin < b.endMin && a.endMin > b.startMin;
}

function bookingRange(booking: BookingWithTreatments): TimeRange {
  const startMin = timeToMinutes(booking.booking_time);
  const duration =
    booking.totalDuration && booking.totalDuration > 0 ? booking.totalDuration : 60;
  return { startMin, endMin: startMin + duration };
}

/**
 * Therapists a booking must be displayed under. A duo shows up in every accepted
 * therapist's column. Empty result = the booking belongs to the "unassigned" column.
 */
export function therapistIdsForBooking(booking: BookingWithTreatments): string[] {
  const ids = new Set<string>();
  // booking_treatments.therapist_id is the stable soin↔therapist link.
  (booking.treatments ?? []).forEach((t) => {
    if (t.therapist_id) ids.add(t.therapist_id);
  });
  (booking.booking_therapists ?? []).forEach((bt) => {
    if (bt.status === "accepted" && bt.therapist_id) ids.add(bt.therapist_id);
  });
  if (ids.size === 0 && booking.therapist_id) ids.add(booking.therapist_id);
  return [...ids];
}

/**
 * One column per therapist for a single day at a single venue: declared shifts,
 * their bookings, and who could actually take a given treatment each hour.
 *
 * Availability is strictly declarative — no therapist_availability row means
 * "not available", matching `useAvailableTherapistsForSlot` (the reference for
 * therapist pickers) rather than `useVenueAvailability` (which fails open).
 *
 * The hourly answer depends on what is being asked:
 *   - no treatment searched → "who has free time during this hour"
 *   - a treatment searched  → "who could start it at this hour", i.e. qualified
 *     for it (therapist_treatments) and with nothing overlapping its duration
 *
 * A shift only has to cover the *start* of the treatment, exactly like
 * `computeSlotCapacity` and the admin picker: a soin running past the end of a
 * shift is allowed there, merely flagged. Requiring full containment would show
 * 0 where the booking flow happily accepts the slot. Overlaps with another
 * booking or with a venue-wide blocked slot are real blockers and do count.
 *
 * All of this ignores rooms and turnover buffers, so it describes therapist
 * headcount, not bookability — the create-booking therapist picker stays the
 * authority before committing a reservation.
 */
export function useTherapistDayPlanning({
  venueId,
  date,
  bookings,
  startHour,
  endHour,
  showOnlyScheduled,
  treatment,
}: UseTherapistDayPlanningOptions): TherapistDayPlanning {
  const dateStr = format(date, "yyyy-MM-dd");
  const dayOfWeek = date.getDay(); // 0 = Sunday

  const { data: therapistLinks, isLoading: isLoadingTherapists } = useVenueTherapists(
    venueId ? [venueId] : null,
  );

  const venueTherapists = useMemo(
    () => (venueId ? therapistsOfVenue(therapistLinks, venueId) : []),
    [therapistLinks, venueId],
  );

  const therapistIds = useMemo(
    () => venueTherapists.map((t) => t.id),
    [venueTherapists],
  );

  const { data: schedules, isLoading: isLoadingSchedules } = useQuery({
    queryKey: ["therapist-day-planning", "schedules", venueId, dateStr, therapistIds],
    enabled: !!venueId && therapistIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("therapist_availability")
        .select("therapist_id, is_available, shifts")
        .eq("date", dateStr)
        .in("therapist_id", therapistIds);
      if (error) throw error;

      return (data || []).map((row) => ({
        therapist_id: row.therapist_id,
        is_available: row.is_available,
        shifts: parseShifts(row.shifts),
      }));
    },
  });

  // Blocages du lieu : récurrents hebdomadaires (block_date NULL) + ponctuels
  // datés de ce jour. Un blocage daté peut viser une salle précise (room_id) —
  // il ne ferme alors pas l'heure, il informe.
  const { data: blockedSlots } = useQuery({
    queryKey: ["therapist-day-planning", "blocked-slots", venueId, dateStr],
    enabled: !!venueId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_blocked_slots")
        .select("id, label, start_time, end_time, days_of_week, block_date, room_id, treatment_rooms(name)")
        .eq("hotel_id", venueId!)
        .eq("is_active", true)
        .or(`block_date.is.null,block_date.eq.${dateStr}`);
      if (error) throw error;
      return data || [];
    },
  });

  // Nombre de salles actives : une heure n'est réellement fermée que si tous les
  // blocages salle du créneau couvrent l'intégralité du lieu.
  const { data: activeRoomIds } = useQuery({
    queryKey: ["therapist-day-planning", "rooms", venueId],
    enabled: !!venueId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_rooms")
        .select("id, status")
        .eq("hotel_id", venueId!);
      if (error) throw error;
      return (data || [])
        .filter((r) => ACTIVE_STATUSES.includes((r.status || "").toLowerCase()))
        .map((r) => r.id);
    },
  });

  // Which treatments each therapist of the venue performs. Only needed while a
  // treatment is searched. One row per (therapist, treatment) association, so a
  // single venue's team stays well under the PostgREST 1000-row cap.
  const { data: therapistTreatments, isLoading: isLoadingQualifications } = useQuery({
    queryKey: ["therapist-day-planning", "qualifications", venueId, therapistIds],
    enabled: !!venueId && !!treatment && therapistIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("therapist_treatments")
        .select("therapist_id, treatment_menu_id")
        .in("therapist_id", therapistIds);
      if (error) throw error;
      return data || [];
    },
  });

  return useMemo<TherapistDayPlanning>(() => {
    const dayStart = startHour * 60;
    const dayEnd = endHour * 60;
    const isLoading =
      isLoadingTherapists || isLoadingSchedules || (!!treatment && isLoadingQualifications);

    // Shifts and blocked slots can extend past the rendered window (a 6:00 shift
    // on a grid starting at 7:00). Clamp so consumers can position them directly.
    const clamp = (range: TimeRange): TimeRange => ({
      startMin: Math.max(dayStart, range.startMin),
      endMin: Math.min(dayEnd, range.endMin),
    });
    const isVisible = (range: TimeRange) => range.endMin > range.startMin;

    // Un blocage récurrent ne vaut que les jours qu'il déclare ; un blocage daté
    // est déjà restreint à ce jour par la requête.
    const appliesToday = (b: { block_date: string | null; days_of_week: number[] | null }) =>
      b.block_date !== null || b.days_of_week === null || b.days_of_week.includes(dayOfWeek);

    const toRange = (b: { id: string; label: string; start_time: string; end_time: string }) => ({
      id: b.id,
      label: b.label,
      ...clamp({ startMin: timeToMinutes(b.start_time), endMin: timeToMinutes(b.end_time) }),
    });

    // Ferment le lieu entier : récurrents, et blocages datés sans salle ciblée.
    const blockedRanges: BlockedRange[] = (blockedSlots || [])
      .filter((b) => appliesToday(b) && b.room_id === null)
      .map(toRange)
      .filter(isVisible)
      .sort((a, b) => a.startMin - b.startMin);

    // Ciblent une salle : informatifs tant qu'il reste une salle libre.
    const roomBlockedRanges: RoomBlockedRange[] = (blockedSlots || [])
      .filter((b) => b.block_date !== null && b.room_id !== null)
      .map((b) => ({
        ...toRange(b),
        roomId: b.room_id as string,
        roomName: (b.treatment_rooms as { name: string } | null)?.name ?? null,
      }))
      .filter(isVisible)
      .sort((a, b) => a.startMin - b.startMin);

    // Toutes les salles actives bloquées sur un créneau = le lieu y est fermé.
    const roomCount = (activeRoomIds || []).length;
    const isFullyBlockedByRooms = (range: TimeRange): boolean => {
      if (roomCount === 0) return false;
      const covered = new Set(
        roomBlockedRanges.filter((b) => overlaps(range, b)).map((b) => b.roomId),
      );
      return (activeRoomIds || []).every((id) => covered.has(id));
    };

    const dayBookings = (bookings || []).filter(
      (b) =>
        b.hotel_id === venueId &&
        b.booking_date === dateStr &&
        !!b.booking_time &&
        !HIDDEN_BOOKING_STATUSES.includes(b.status),
    );

    // Cards show every booking (a completed soin still happened), but a booking
    // only consumes a therapist's time while it is still active.
    const isBlocking = (b: BookingWithTreatments) =>
      !EXCLUDED_BOOKING_STATUSES.includes(b.status);

    const bookingsByTherapist = new Map<string, BookingWithTreatments[]>();
    const unassignedBookings: BookingWithTreatments[] = [];
    for (const booking of dayBookings) {
      const ids = therapistIdsForBooking(booking);
      if (ids.length === 0) {
        unassignedBookings.push(booking);
        continue;
      }
      for (const id of ids) {
        const list = bookingsByTherapist.get(id) ?? [];
        list.push(booking);
        bookingsByTherapist.set(id, list);
      }
    }

    // Qualification rule, identical to `filterQualifiedTherapists` in the edge
    // engine: no association at all = versatile, otherwise the treatment must be
    // listed. Diverging here would show staff the picker then refuses.
    const ownedByTherapist = new Map<string, Set<string>>();
    (therapistTreatments || []).forEach((row) => {
      const owned = ownedByTherapist.get(row.therapist_id) ?? new Set<string>();
      owned.add(row.treatment_menu_id);
      ownedByTherapist.set(row.therapist_id, owned);
    });
    const isQualifiedFor = (therapistId: string): boolean => {
      if (!treatment) return true;
      const owned = ownedByTherapist.get(therapistId);
      if (!owned || owned.size === 0) return true;
      return owned.has(treatment.id);
    };

    const scheduleByTherapist = new Map(
      (schedules || []).map((s) => [s.therapist_id, s]),
    );

    const allColumns: TherapistDayColumn[] = (venueTherapists || []).map((therapist) => {
      const schedule = scheduleByTherapist.get(therapist.id);
      const hasNoSchedule = !schedule;
      const isAbsent = !!schedule && !schedule.is_available;

      let openRanges: TimeRange[] = [];
      if (schedule && schedule.is_available) {
        openRanges =
          schedule.shifts.length === 0
            ? // Available with no shift detail = open all day, same as the picker.
              [{ startMin: dayStart, endMin: dayEnd }]
            : schedule.shifts
                .map((s) =>
                  clamp({ startMin: timeToMinutes(s.start), endMin: timeToMinutes(s.end) }),
                )
                .filter(isVisible)
                .sort((a, b) => a.startMin - b.startMin);
      }

      return {
        therapist,
        openRanges,
        isAbsent,
        hasNoSchedule,
        isQualified: isQualifiedFor(therapist.id),
        bookings: bookingsByTherapist.get(therapist.id) ?? [],
      };
    });

    // Computed over the whole team so the figure doesn't change when columns are hidden.
    const requiredDuration = treatment ? treatment.duration || 60 : null;
    const availabilityByHour = new Map<number, HourAvailability>();

    for (let hour = startHour; hour < endHour; hour++) {
      const hourStart = hour * 60;
      // Searching a treatment asks "can it start here and run to the end", so the
      // window is its full duration; otherwise it's just "free during this hour".
      const needed: TimeRange = requiredDuration
        ? { startMin: hourStart, endMin: hourStart + requiredDuration }
        : { startMin: hourStart, endMin: hourStart + 60 };

      if (blockedRanges.some((b) => overlaps(needed, b)) || isFullyBlockedByRooms(needed)) {
        availabilityByHour.set(hour, { hour, free: [], isBlocked: true });
        continue;
      }

      const free: FreeTherapist[] = [];
      for (const col of allColumns) {
        if (!col.isQualified) continue;
        // The shift only has to cover the start, like both booking engines.
        const shift = col.openRanges.find(
          (r) => r.startMin <= hourStart && hourStart < r.endMin,
        );
        if (!shift) continue;
        const busy = col.bookings.some(
          (b) => isBlocking(b) && overlaps(needed, bookingRange(b)),
        );
        if (busy) continue;
        free.push({
          therapist: col.therapist,
          overflowsShift: needed.endMin > shift.endMin,
        });
      }

      availabilityByHour.set(hour, { hour, free, isBlocked: false });
    }

    const columns = showOnlyScheduled
      ? allColumns.filter((col) => col.openRanges.length > 0 || col.bookings.length > 0)
      : allColumns;

    return {
      columns,
      unassignedBookings,
      blockedRanges,
      roomBlockedRanges,
      availabilityByHour,
      totalTherapistCount: allColumns.length,
      qualifiedTherapistCount: allColumns.filter((col) => col.isQualified).length,
      hiddenColumnCount: allColumns.length - columns.length,
      isLoading,
    };
  }, [
    venueTherapists,
    schedules,
    blockedSlots,
    activeRoomIds,
    therapistTreatments,
    treatment,
    bookings,
    venueId,
    dateStr,
    dayOfWeek,
    startHour,
    endHour,
    showOnlyScheduled,
    isLoadingTherapists,
    isLoadingSchedules,
    isLoadingQualifications,
  ]);
}
