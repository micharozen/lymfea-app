// Pure, side-effect-free slot availability logic used by the get-availability
// edge function (via _shared/availability-query.ts).
//
// Keeping this in one place makes it possible to unit-test the rules and
// guarantees availability stays in sync with reserve_trunk_atomically (RPC).

export interface Booking {
  booking_time: string; // "HH:MM:SS" venue-local
  therapist_id: string | null;
  room_id: string | null;
  secondary_room_id: string | null; // overflow room for a duo spanning two rooms
  duration: number | null;
  guest_count: number | null; // beds consumed across room_id (+ secondary_room_id)
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

// A booking overlaps the requested slot when their intervals intersect, with the
// room turnover buffer applied symmetrically — a turnover gap is required both
// after the existing booking AND after the requested slot. This matches
// reserve_trunk_atomically's conflict test exactly:
//   _new_start < bookingEnd + turnover  AND  _new_end + turnover > bookingStart
// Applying turnover only on the booking side (as before) let a slot that ends
// right when a booking starts pass availability but be rejected by the RPC —
// the client was charged, then the reservation failed (NO_ROOM_AVAILABLE).
export const doesBookingBlockSlot = (
  slot: string,
  requestedDuration: number,
  bookingTime: string,
  bookingDuration: number | null,
  turnoverMinutes: number,
): boolean => {
  const slotStart = timeToMinutes(slot);
  const slotEnd = slotStart + requestedDuration + turnoverMinutes;
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

  // Room capacity is bookable only when the room is empty. A multi-bed room can
  // host a duo/trio as one booking, but it cannot be shared by separate bookings.
  // A blocking booking therefore closes its room(s) completely. Bookings without
  // an assigned room, and legacy overflow with no secondary_room_id, drain the
  // generic pool by guest_count.
  const capacityById = new Map(rooms.map((r) => [r.id, r.capacity || 1]));
  const occupiedRoomIds = new Set<string>();
  let capacityWithoutRoom = 0;
  for (const b of blocking) {
    const g = b.guest_count ?? 1;
    if (!b.room_id) {
      capacityWithoutRoom += g;
      continue;
    }
    occupiedRoomIds.add(b.room_id);

    const primaryBeds = Math.min(g, capacityById.get(b.room_id) ?? 1);
    const overflow = g - primaryBeds;
    if (overflow > 0) {
      if (b.secondary_room_id) {
        occupiedRoomIds.add(b.secondary_room_id);
      } else {
        capacityWithoutRoom += overflow;
      }
    }
  }
  const freeRoomCapacity = rooms.reduce(
    (sum, r) => sum + (occupiedRoomIds.has(r.id) ? 0 : (r.capacity || 1)),
    0,
  ) - capacityWithoutRoom;

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
// `requiredTreatmentIds` holds the treatment_menus ids of the selected soins,
// add-ons and amenities excluded (an add-on is performed by the therapist of its
// base soin; an amenity mobilises no therapist). A therapist qualifies when:
//   - no treatment is required (treatment-agnostic query), or
//   - they have no therapist_treatments row (backward compat / polyvalent), or
//   - their associations cover EVERY required treatment.
// Must stay byte-for-byte equivalent to the predicate in
// reserve_trunk_atomically: a slot shown here that the RPC then refuses means
// the client pays before the booking fails.
export function filterQualifiedTherapists<T extends { therapist_id: string }>(
  therapists: T[],
  requiredTreatmentIds: Set<string>,
  treatmentsByTherapist: Map<string, Set<string>>,
): T[] {
  if (requiredTreatmentIds.size === 0) return therapists;
  return therapists.filter((t) => {
    const owned = treatmentsByTherapist.get(t.therapist_id);
    if (!owned || owned.size === 0) return true;
    return [...requiredTreatmentIds].every((id) => owned.has(id));
  });
}
