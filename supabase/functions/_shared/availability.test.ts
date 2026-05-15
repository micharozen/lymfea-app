import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  type Booking,
  doesBookingBlockSlot,
  isSlotAvailable,
  type Room,
  type SlotAvailabilityInput,
} from "./availability.ts";

const ROOM_A: Room = { id: "room-a", capacity: 1 };
const ROOM_B: Room = { id: "room-b", capacity: 1 };
const ROOM_DUO: Room = { id: "room-duo", capacity: 2 };

const THERAPIST_1 = "therapist-1";
const THERAPIST_2 = "therapist-2";

function input(over: Partial<SlotAvailabilityInput> = {}): SlotAvailabilityInput {
  return {
    slot: "19:30:00",
    requestedDuration: 60,
    roomTurnoverBuffer: 15,
    rooms: [ROOM_A],
    bookings: [],
    pendingHolds: [],
    scheduledTherapistIds: [THERAPIST_1, THERAPIST_2],
    scheduleByTherapist: new Map(),
    crossVenueBookings: [],
    travelBuffer: 0,
    requiredGuestCount: 1,
    ...over,
  };
}

function booking(over: Partial<Booking> = {}): Booking {
  return {
    booking_time: "19:30:00",
    therapist_id: null,
    room_id: ROOM_A.id,
    duration: 60,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// doesBookingBlockSlot — pure interval-overlap helper with turnover buffer
// ---------------------------------------------------------------------------

Deno.test("doesBookingBlockSlot: exact same time blocks", () => {
  assertStrictEquals(doesBookingBlockSlot("19:30:00", 60, "19:30:00", 60, 0), true);
});

Deno.test("doesBookingBlockSlot: non-overlapping times don't block", () => {
  // Slot 10:00-11:00, booking 12:00-13:00
  assertStrictEquals(doesBookingBlockSlot("10:00:00", 60, "12:00:00", 60, 0), false);
});

Deno.test("doesBookingBlockSlot: turnover buffer extends block window", () => {
  // Booking 10:00-11:00 +15min turnover → blocks up to 11:15
  // Slot 11:00-12:00 should be blocked
  assertStrictEquals(doesBookingBlockSlot("11:00:00", 60, "10:00:00", 60, 15), true);
  // Slot 11:15-12:15 is no longer blocked (slotStart 11:15 == bookingEnd 11:15)
  assertStrictEquals(doesBookingBlockSlot("11:15:00", 60, "10:00:00", 60, 15), false);
});

Deno.test("doesBookingBlockSlot: long slot starting before booking blocks", () => {
  // Slot 09:00-11:00 (120min), booking 10:00-11:00 → blocking
  assertStrictEquals(doesBookingBlockSlot("09:00:00", 120, "10:00:00", 60, 0), true);
});

Deno.test("doesBookingBlockSlot: null booking duration defaults to 30min", () => {
  // Booking 10:00 + null duration → 10:00-10:30
  assertStrictEquals(doesBookingBlockSlot("10:15:00", 30, "10:00:00", null, 0), true);
  assertStrictEquals(doesBookingBlockSlot("10:30:00", 30, "10:00:00", null, 0), false);
});

// ---------------------------------------------------------------------------
// isSlotAvailable — room capacity
// ---------------------------------------------------------------------------

Deno.test("REGRESSION: booking with therapist_id=null still occupies its room", () => {
  // The original bug: pending bookings created by confirmSetupIntent set room_id
  // but leave therapist_id=null (assigned later by broadcast). The old code
  // filtered these out of capacityBookings → slot wrongly shown as available
  // → user paid → reserve_trunk_atomically rejected with NO_ROOM_AVAILABLE.
  const result = isSlotAvailable(input({
    bookings: [booking({ therapist_id: null, room_id: ROOM_A.id })],
  }));
  assertStrictEquals(result, false);
});

Deno.test("single room, slot free → available", () => {
  assertStrictEquals(isSlotAvailable(input()), true);
});

Deno.test("single room occupied by booking with assigned therapist → unavailable", () => {
  const result = isSlotAvailable(input({
    bookings: [booking({ therapist_id: THERAPIST_1 })],
  }));
  assertStrictEquals(result, false);
});

Deno.test("two rooms, one occupied → still available", () => {
  const result = isSlotAvailable(input({
    rooms: [ROOM_A, ROOM_B],
    bookings: [booking({ room_id: ROOM_A.id })],
  }));
  assertStrictEquals(result, true);
});

Deno.test("non-overlapping booking does not occupy capacity", () => {
  // Booking 10:00-11:00, slot 12:00 → not blocking even with single room
  const result = isSlotAvailable(input({
    slot: "12:00:00",
    bookings: [booking({ booking_time: "10:00:00" })],
  }));
  assertStrictEquals(result, true);
});

Deno.test("booking without room_id consumes one generic room slot", () => {
  // 2 rooms, 1 booking without room_id → 1 effective room left
  const result1 = isSlotAvailable(input({
    rooms: [ROOM_A, ROOM_B],
    bookings: [booking({ room_id: null })],
  }));
  assertStrictEquals(result1, true);

  // 2 rooms, 2 bookings without room_id → 0 left
  const result2 = isSlotAvailable(input({
    rooms: [ROOM_A, ROOM_B],
    bookings: [
      booking({ room_id: null, therapist_id: THERAPIST_1 }),
      booking({ room_id: null, therapist_id: THERAPIST_2 }),
    ],
  }));
  assertStrictEquals(result2, false);
});

Deno.test("turnover buffer blocks adjacent slot", () => {
  // Booking 18:30-19:30 (+15min buffer = 19:45), slot 19:30 → blocked
  const result = isSlotAvailable(input({
    slot: "19:30:00",
    bookings: [booking({ booking_time: "18:30:00" })],
  }));
  assertStrictEquals(result, false);
});

Deno.test("turnover buffer respected: slot starting exactly at buffer end is free", () => {
  // Booking 18:00-19:00 +15 = blocks up to 19:15. Slot 19:15 free, but no
  // therapist booking exists so still available.
  const result = isSlotAvailable(input({
    slot: "19:15:00",
    bookings: [booking({ booking_time: "18:00:00", room_id: ROOM_B.id })],
    rooms: [ROOM_A, ROOM_B],
  }));
  assertStrictEquals(result, true);
});

// ---------------------------------------------------------------------------
// isSlotAvailable — duo / capacity
// ---------------------------------------------------------------------------

Deno.test("duo room (capacity 2) satisfies requiredGuestCount=2", () => {
  const result = isSlotAvailable(input({
    rooms: [ROOM_DUO],
    requiredGuestCount: 2,
  }));
  assertStrictEquals(result, true);
});

Deno.test("requiredGuestCount=2 with two single rooms is satisfied", () => {
  const result = isSlotAvailable(input({
    rooms: [ROOM_A, ROOM_B],
    requiredGuestCount: 2,
  }));
  assertStrictEquals(result, true);
});

Deno.test("requiredGuestCount=2 with single room fails", () => {
  const result = isSlotAvailable(input({
    rooms: [ROOM_A],
    requiredGuestCount: 2,
  }));
  assertStrictEquals(result, false);
});

// ---------------------------------------------------------------------------
// isSlotAvailable — therapist availability
// ---------------------------------------------------------------------------

Deno.test("no scheduled therapists → unavailable", () => {
  const result = isSlotAvailable(input({ scheduledTherapistIds: [] }));
  assertStrictEquals(result, false);
});

Deno.test("therapist busy with overlapping booking → unavailable when only 1 therapist", () => {
  const result = isSlotAvailable(input({
    scheduledTherapistIds: [THERAPIST_1],
    rooms: [ROOM_A, ROOM_B],
    bookings: [booking({ therapist_id: THERAPIST_1, room_id: ROOM_B.id })],
  }));
  assertStrictEquals(result, false);
});

Deno.test("therapist busy but another free → available", () => {
  const result = isSlotAvailable(input({
    rooms: [ROOM_A, ROOM_B],
    bookings: [booking({ therapist_id: THERAPIST_1, room_id: ROOM_B.id })],
  }));
  assertStrictEquals(result, true);
});

Deno.test("therapist outside shift → not counted as available", () => {
  const result = isSlotAvailable(input({
    slot: "08:00:00",
    scheduledTherapistIds: [THERAPIST_1],
    scheduleByTherapist: new Map([
      [THERAPIST_1, { shifts: [{ start: "10:00", end: "18:00" }] }],
    ]),
  }));
  assertStrictEquals(result, false);
});

Deno.test("therapist inside one of multiple shifts → available", () => {
  const result = isSlotAvailable(input({
    slot: "14:00:00",
    scheduledTherapistIds: [THERAPIST_1],
    scheduleByTherapist: new Map([
      [THERAPIST_1, {
        shifts: [
          { start: "09:00", end: "12:00" },
          { start: "13:00", end: "18:00" },
        ],
      }],
    ]),
  }));
  assertStrictEquals(result, true);
});

Deno.test("empty shifts list = no schedule data = available all day", () => {
  const result = isSlotAvailable(input({
    slot: "23:30:00",
    scheduledTherapistIds: [THERAPIST_1],
    scheduleByTherapist: new Map([[THERAPIST_1, { shifts: [] }]]),
  }));
  assertStrictEquals(result, true);
});

// ---------------------------------------------------------------------------
// isSlotAvailable — cross-venue travel buffer
// ---------------------------------------------------------------------------

Deno.test("cross-venue booking within travel buffer blocks therapist", () => {
  // Therapist booked at OTHER venue 18:00-19:00 + 20min travel buffer →
  // unavailable until 19:20. Slot 19:00 should be blocked.
  const result = isSlotAvailable(input({
    slot: "19:00:00",
    scheduledTherapistIds: [THERAPIST_1],
    crossVenueBookings: [
      { therapist_id: THERAPIST_1, booking_time: "18:00:00", duration: 60 },
    ],
    travelBuffer: 20,
  }));
  assertStrictEquals(result, false);
});

Deno.test("cross-venue booking outside travel buffer doesn't block", () => {
  const result = isSlotAvailable(input({
    slot: "19:30:00",
    scheduledTherapistIds: [THERAPIST_1],
    crossVenueBookings: [
      { therapist_id: THERAPIST_1, booking_time: "18:00:00", duration: 60 },
    ],
    travelBuffer: 20,
  }));
  assertStrictEquals(result, true);
});

// ---------------------------------------------------------------------------
// isSlotAvailable — pending holds (in-cart, not yet persisted)
// ---------------------------------------------------------------------------

Deno.test("overlapping pending hold consumes 1 room + 1 therapist", () => {
  // 1 room, 2 therapists, 1 hold overlapping → room is gone
  const result = isSlotAvailable(input({
    rooms: [ROOM_A],
    pendingHolds: [{ time: "19:30:00", duration: 60 }],
  }));
  assertStrictEquals(result, false);
});

Deno.test("non-overlapping pending hold doesn't block", () => {
  const result = isSlotAvailable(input({
    pendingHolds: [{ time: "10:00:00", duration: 60 }],
  }));
  assertStrictEquals(result, true);
});

Deno.test("multiple holds reduce therapist count below required", () => {
  const result = isSlotAvailable(input({
    rooms: [ROOM_A, ROOM_B],
    pendingHolds: [
      { time: "19:30:00", duration: 60 },
      { time: "19:30:00", duration: 60 },
    ],
  }));
  // 2 rooms - 2 holds = 0 free → false
  assertStrictEquals(result, false);
});

// ---------------------------------------------------------------------------
// isSlotAvailable — edge cases mirroring the reported bug
// ---------------------------------------------------------------------------

Deno.test("BUG SCENARIO: Hôtel de Buci — 1 room, 2 pending card_saved holds (therapist_id=null) block their slots", () => {
  const bookings: Booking[] = [
    booking({ booking_time: "17:00:00", therapist_id: null, room_id: ROOM_A.id }),
    booking({ booking_time: "19:30:00", therapist_id: null, room_id: ROOM_A.id }),
  ];

  // Slot 17:00 → blocked
  assertStrictEquals(
    isSlotAvailable(input({ slot: "17:00:00", bookings })),
    false,
  );
  // Slot 19:30 → blocked
  assertStrictEquals(
    isSlotAvailable(input({ slot: "19:30:00", bookings })),
    false,
  );
  // Slot 18:30 → blocked (overlaps 19:30 booking via turnover from preceding)
  // 18:30+60=19:30, vs booking 19:30-20:30+15=20:45 → 18:30<20:45 && 19:30>19:30 false
  // Actually 19:30>19:30 is false → not blocking from 19:30 booking.
  // But turnover from 17:00 booking: 17:00-18:00+15=18:15. 18:30<18:15? false → ok.
  // 18:30 should be free.
  assertStrictEquals(
    isSlotAvailable(input({ slot: "18:30:00", bookings })),
    true,
  );
  // Slot 18:15 → free? bookings 17:00-18:15 (with turnover), slot 18:15-19:15.
  // 18:15<18:15 false → not blocked by 17:00. 18:15<20:45 && 19:15>19:30 false → free.
  assertStrictEquals(
    isSlotAvailable(input({ slot: "18:15:00", bookings })),
    true,
  );
  // Slot 18:00 → blocked by 17:00 booking (overlap 18:00 < 18:15 buffer)
  assertStrictEquals(
    isSlotAvailable(input({ slot: "18:00:00", bookings })),
    false,
  );
});
