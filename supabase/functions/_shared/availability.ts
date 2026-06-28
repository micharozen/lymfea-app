// Pure, side-effect-free slot availability logic used by the get-availability
// edge function (via _shared/availability-query.ts).
//
// Keeping this in one place makes it possible to unit-test the rules and
// guarantees availability stays in sync with reserve_trunk_atomically (RPC).

export interface Booking {
  booking_time: string; // "HH:MM:SS" venue-local
  therapist_id: string | null;
  room_id: string | null;
  duration: number | null;
  guest_count: number | null; // beds consumed in the room (duo = 2)
}

export interface CrossVenueBooking {
  therapist_id: string | null;
  booking_time: string;
  duration: number | null;
}

export interface Room {
  id: string;
  capacity: number;
}

export interface PendingHold {
  time: string;
  duration: number;
}

export interface TherapistShift {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface SlotAvailabilityInput {
  slot: string; // "HH:MM:SS" venue-local
  requestedDuration: number; // minutes
  roomTurnoverBuffer: number; // minutes
  rooms: Room[];
  bookings: Booking[];
  pendingHolds: PendingHold[]; // already filtered to current date
  scheduledTherapistIds: string[];
  scheduleByTherapist?: Map<string, { shifts: TherapistShift[] }>;
  crossVenueBookings?: CrossVenueBooking[];
  travelBuffer?: number;
  requiredGuestCount: number;
}

export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

// A booking overlaps the requested slot when their intervals intersect, taking
// the room turnover buffer into account on the booking side.
// Slot interval:    [slotStart, slotStart + requestedDuration)
// Booking interval: [bookingStart, bookingEnd + turnover)
export const doesBookingBlockSlot = (
  slot: string,
  requestedDuration: number,
  bookingTime: string,
  bookingDuration: number | null,
  turnoverMinutes: number,
): boolean => {
  const slotStart = timeToMinutes(slot);
  const slotEnd = slotStart + requestedDuration;
  const bookingStart = timeToMinutes(bookingTime);
  const bookingEnd = bookingStart + (bookingDuration ?? 30) + turnoverMinutes;
  return slotStart < bookingEnd && slotEnd > bookingStart;
};

export interface SlotCapacity {
  /** Free room capacity at the slot, net of overlapping pending holds. */
  rooms: number;
  /** Free, scheduled, qualified therapists, net of overlapping pending holds. */
  therapists: number;
  /** Simultaneous bookings still possible = min(rooms, therapists), clamped to >= 0. */
  capacity: number;
}

// Effective bookable capacity at a slot. A booking needs BOTH a free room and a
// free therapist, so the number of simultaneous bookings still possible is the
// min of the two (never over-counts). `isSlotAvailable` is just this compared to
// the requested guest count — keeping one source of truth for both.
export function computeSlotCapacity(input: SlotAvailabilityInput): SlotCapacity {
  const {
    slot,
    requestedDuration,
    roomTurnoverBuffer,
    rooms,
    bookings,
    pendingHolds,
    scheduledTherapistIds,
    scheduleByTherapist,
    crossVenueBookings = [],
    travelBuffer = 0,
  } = input;

  const slotStart = timeToMinutes(slot);
  const slotEnd = slotStart + requestedDuration;

  // Bookings overlapping this slot. Includes bookings without an assigned
  // therapist (e.g. card-saved holds awaiting therapist broadcast) — they still
  // hold a room and must block capacity, matching reserve_trunk_atomically.
  const blocking = bookings.filter((b) =>
    doesBookingBlockSlot(slot, requestedDuration, b.booking_time, b.duration, roomTurnoverBuffer)
  );

  // Room capacity: a room has `capacity` beds (simultaneous occupations). Each
  // blocking booking consumes `guest_count` beds (duo = 2). A room stays partly
  // available until its beds are full — matching reserve_trunk_atomically.
  // Bookings without an assigned room (e.g. card-saved holds awaiting therapist
  // broadcast) still hold beds and must drain the pool.
  const occupiedBedsByRoom = new Map<string, number>();
  let bedsWithoutRoom = 0;
  for (const b of blocking) {
    const g = b.guest_count ?? 1;
    if (b.room_id) occupiedBedsByRoom.set(b.room_id, (occupiedBedsByRoom.get(b.room_id) ?? 0) + g);
    else bedsWithoutRoom += g;
  }
  const freeRoomCapacity = rooms.reduce(
    (sum, r) => sum + Math.max(0, (r.capacity || 1) - (occupiedBedsByRoom.get(r.id) ?? 0)),
    0,
  ) - bedsWithoutRoom;

  const overlappingHolds = pendingHolds.filter((h) => {
    const hs = timeToMinutes(h.time);
    const he = hs + (h.duration || 30);
    return slotStart < he && slotEnd > hs;
  }).length;

  // At least one therapist must be free, scheduled in shift, and not blocked by
  // the cross-venue travel buffer.
  const busyTherapists = new Set(
    blocking
      .map((b) => b.therapist_id)
      .filter((id): id is string => id !== null),
  );

  const availableTherapistCount = scheduledTherapistIds.filter((id) => {
    if (busyTherapists.has(id)) return false;

    if (travelBuffer > 0) {
      const blockedCross = crossVenueBookings.some((b) => {
        if (b.therapist_id !== id) return false;
        const bs = timeToMinutes(b.booking_time);
        const be = bs + (b.duration ?? 30);
        return slotStart >= bs - travelBuffer && slotStart < be + travelBuffer;
      });
      if (blockedCross) return false;
    }

    const schedule = scheduleByTherapist?.get(id);
    if (!schedule || schedule.shifts.length === 0) return true;
    return schedule.shifts.some((shift) => {
      const ss = timeToMinutes(shift.start + ":00");
      const se = timeToMinutes(shift.end + ":00");
      return slotStart >= ss && slotStart < se;
    });
  }).length;

  const freeRooms = Math.max(0, freeRoomCapacity - overlappingHolds);
  const freeTherapists = Math.max(0, availableTherapistCount - overlappingHolds);
  return { rooms: freeRooms, therapists: freeTherapists, capacity: Math.min(freeRooms, freeTherapists) };
}

export function isSlotAvailable(input: SlotAvailabilityInput): boolean {
  return computeSlotCapacity(input).capacity >= input.requiredGuestCount;
}

// Statuses that count as "active" for availability purposes. Matches the
// reserve_trunk_atomically RPC. Stale awaiting_payment (>10min old) is also
// excluded by the RPC; the edge functions should mirror that if/when they
// surface awaiting_payment bookings.
export const ACTIVE_BOOKING_STATUS_FILTER =
  '("Annulé","Terminé","cancelled","completed","noshow")';

// Qualification rule: which therapists can perform the requested treatment(s).
// `requiredCategories` holds the treatment_type slug(s) of the selected
// treatment(s). A therapist qualifies when:
//   - no category is required (treatment-agnostic query), or
//   - they have no skills assigned (backward compat / polyvalent), or
//   - at least one of their skills matches a required category.
// Single source of truth shared by every availability path.
export function filterQualifiedTherapists<T extends { skills: string[] | null }>(
  therapists: T[],
  requiredCategories: Set<string>,
): T[] {
  if (requiredCategories.size === 0) return therapists;
  return therapists.filter((t) => {
    const skills = t.skills;
    if (!skills || skills.length === 0) return true;
    return [...requiredCategories].some((cat) => skills.includes(cat));
  });
}
