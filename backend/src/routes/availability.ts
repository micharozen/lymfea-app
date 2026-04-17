import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase";

/**
 * Availability routes — public (no auth required).
 *
 * Migrated from: supabase/functions/check-availability/index.ts
 *
 * MIGRATION NOTE:
 * This is a 1:1 port of the Edge Function. The logic is identical.
 * Key changes from Deno → Bun:
 *   - `serve(async (req) =>)` → `app.post("/check", async (c) =>)`
 *   - `Deno.env.get(...)` → `process.env.XXX`
 *   - Inline `createClient()` → shared `supabaseAdmin`
 *   - CORS handled globally by Hono middleware (no manual corsHeaders)
 *   - `supabase.functions.invoke(...)` → direct function import (if needed)
 */
const availability = new Hono();

availability.post("/check", async (c) => {
  const { hotelId, date, treatmentIds, therapistGender } = await c.req.json();

  if (!hotelId || !date) {
    return c.json({ error: "Missing hotelId or date" }, 400);
  }

  const _debug: Record<string, unknown> = {};
  _debug.input = { hotelId, date, treatmentIds, therapistGender };

  // Check if venue is deployed on this date
  const { data: isVenueAvailable, error: scheduleError } =
    await supabaseAdmin.rpc("is_venue_available_on_date", {
      _hotel_id: hotelId,
      _check_date: date,
    });

  if (scheduleError) {
    console.error("Error checking venue schedule:", scheduleError);
  }

  _debug.isVenueAvailable = isVenueAvailable;

  if (isVenueAvailable === false) {
    return c.json({ availableSlots: [], reason: "venue_not_deployed", _debug });
  }

  // Get hotel opening/closing hours and slot interval
  const { data: hotelData, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("opening_time, closing_time, slot_interval")
    .eq("id", hotelId)
    .single();

  if (hotelError) {
    console.error("Error fetching hotel:", hotelError);
  }

  const openingMinutes = hotelData?.opening_time
    ? parseInt(hotelData.opening_time.split(":")[0], 10) * 60 +
      parseInt(hotelData.opening_time.split(":")[1] || "0", 10)
    : 6 * 60;
  const closingMinutes = hotelData?.closing_time
    ? parseInt(hotelData.closing_time.split(":")[0], 10) * 60 +
      parseInt(hotelData.closing_time.split(":")[1] || "0", 10)
    : 23 * 60;

  const slotInterval = hotelData?.slot_interval || 30;

  _debug.openingMinutes = openingMinutes;
  _debug.closingMinutes = closingMinutes;
  _debug.slotInterval = slotInterval;

  // Fetch active blocked slots for this hotel
  const { data: blockedSlots } = await supabaseAdmin
    .from("venue_blocked_slots")
    .select("start_time, end_time, days_of_week")
    .eq("hotel_id", hotelId)
    .eq("is_active", true);

  const requestedDayOfWeek = new Date(date + "T00:00:00").getDay();

  // Get max lead_time and categories from selected treatments
  let maxLeadTime = 0;
  const requiredCategories = new Set<string>();
  if (treatmentIds && treatmentIds.length > 0) {
    const { data: treatments } = await supabaseAdmin
      .from("treatment_menus")
      .select("lead_time, category")
      .in("id", treatmentIds);

    if (treatments && treatments.length > 0) {
      maxLeadTime = Math.max(...treatments.map((t) => t.lead_time || 0));
      treatments.forEach((t: { category?: string | null }) => {
        if (t.category) requiredCategories.add(t.category);
      });
    }
  }

  // Get all active therapists for this hotel
  let therapistQuery = supabaseAdmin
    .from("therapist_venues")
    .select(
      `therapist_id, therapists!inner(id, status, skills, gender)`
    )
    .eq("hotel_id", hotelId);

  if (therapistGender) {
    therapistQuery = therapistQuery.eq("therapists.gender", therapistGender);
  }

  const { data: therapists, error: therapistsError } = await therapistQuery;

  if (therapistsError) {
    console.error("Error fetching therapists:", therapistsError);
    return c.json({ error: therapistsError.message }, 500);
  }

  // Filter active therapists
  const activeTherapists =
    therapists?.filter((h: any) => {
      const status = h.therapists?.status?.toLowerCase();
      return status === "active" || status === "actif";
    }) || [];

  // Filter by category/skills
  const qualifiedTherapists =
    requiredCategories.size === 0
      ? activeTherapists
      : activeTherapists.filter((h: any) => {
          const skills: string[] | null = h.therapists?.skills;
          if (!skills || skills.length === 0) return true;
          return [...requiredCategories].some((cat) => skills.includes(cat));
        });

  // Get treatment rooms
  const { data: treatmentRooms, error: roomsError } = await supabaseAdmin
    .from("treatment_rooms")
    .select("id")
    .eq("hotel_id", hotelId)
    .in("status", ["active", "Actif"]);

  if (roomsError) {
    return c.json({ error: roomsError.message }, 500);
  }

  const totalRooms = treatmentRooms?.length || 0;

  if (totalRooms === 0) {
    return c.json({ availableSlots: [], _debug });
  }

  if (!qualifiedTherapists || qualifiedTherapists.length === 0) {
    return c.json({ availableSlots: [], _debug });
  }

  const therapistIds = qualifiedTherapists.map((h: any) => h.therapist_id);

  // Check therapist schedules
  const { data: therapistSchedules } = await supabaseAdmin
    .from("therapist_availability")
    .select("therapist_id, is_available, shifts")
    .eq("date", date)
    .in("therapist_id", therapistIds);

  const scheduleMap = new Map<
    string,
    { is_available: boolean; shifts: any[] }
  >();
  (therapistSchedules || []).forEach((s: any) => {
    scheduleMap.set(s.therapist_id, {
      is_available: s.is_available,
      shifts: Array.isArray(s.shifts) ? s.shifts : [],
    });
  });

  const scheduledTherapistIds = therapistIds.filter((id: string) => {
    const schedule = scheduleMap.get(id);
    if (!schedule) return true;
    return schedule.is_available;
  });

  if (scheduledTherapistIds.length === 0) {
    return c.json({ availableSlots: [], _debug });
  }

  // Get all active bookings for capacity check
  const { data: allHotelBookings, error: allBookingsError } =
    await supabaseAdmin
      .from("bookings")
      .select("booking_time, therapist_id, status, room_id, duration")
      .eq("booking_date", date)
      .eq("hotel_id", hotelId)
      .not("status", "in", '("Annulé","Terminé","cancelled")');

  if (allBookingsError) {
    return c.json({ error: allBookingsError.message }, 500);
  }

  // Helper functions
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const isSlotBlockedByBooking = (
    slotTime: string,
    bookingTime: string,
    bookingDuration: number
  ): boolean => {
    const slotMinutes = timeToMinutes(slotTime);
    const bookingStartMinutes = timeToMinutes(bookingTime);
    const bookingEndMinutes = bookingStartMinutes + (bookingDuration || 30);
    return slotMinutes >= bookingStartMinutes && slotMinutes < bookingEndMinutes;
  };

  const isSlotInBlockedRange = (slotTime: string): boolean => {
    if (!blockedSlots || blockedSlots.length === 0) return false;
    const slotStartMinutes = timeToMinutes(slotTime);
    const slotEndMinutes = slotStartMinutes + slotInterval;

    return blockedSlots.some((block: any) => {
      if (
        block.days_of_week !== null &&
        !block.days_of_week.includes(requestedDayOfWeek)
      ) {
        return false;
      }
      const blockStartMinutes = timeToMinutes(block.start_time);
      const blockEndMinutes = timeToMinutes(block.end_time);
      return (
        slotStartMinutes < blockEndMinutes && slotEndMinutes > blockStartMinutes
      );
    });
  };

  // Generate time slots
  const timeSlots: string[] = [];
  for (let minutes = openingMinutes; minutes < closingMinutes; minutes += slotInterval) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    timeSlots.push(
      `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`
    );
  }

  // Calculate earliest bookable time based on lead_time
  const now = new Date();
  const requestedDate = new Date(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isToday = requestedDate.getTime() === today.getTime();

  let earliestBookableTime: string | null = null;
  if (isToday && maxLeadTime > 0) {
    const earliestTime = new Date(now.getTime() + maxLeadTime * 60 * 1000);
    const totalEarliestMinutes =
      earliestTime.getHours() * 60 + earliestTime.getMinutes();
    const roundedMinutes =
      Math.ceil(totalEarliestMinutes / slotInterval) * slotInterval;
    const roundedHour = Math.floor(roundedMinutes / 60);
    const roundedMinute = roundedMinutes % 60;
    earliestBookableTime = `${roundedHour.toString().padStart(2, "0")}:${roundedMinute.toString().padStart(2, "0")}:00`;
  }

  // Filter available slots
  const availableSlots = timeSlots.filter((slot) => {
    if (isSlotInBlockedRange(slot)) return false;
    if (isToday && earliestBookableTime && slot < earliestBookableTime)
      return false;

    const bookingsBlockingSlot = (allHotelBookings || []).filter((b: any) =>
      isSlotBlockedByBooking(slot, b.booking_time, b.duration || 30)
    );

    // Room capacity check
    const capacityBookings = bookingsBlockingSlot.filter(
      (b: any) => b.therapist_id !== null
    );
    const occupiedRoomIds = new Set<string>();
    let bookingsWithoutRoom = 0;
    for (const b of capacityBookings) {
      if (b.room_id) {
        occupiedRoomIds.add(b.room_id);
      } else {
        bookingsWithoutRoom++;
      }
    }
    if (totalRooms - occupiedRoomIds.size - bookingsWithoutRoom <= 0)
      return false;

    // Therapist availability check
    const busyTherapists = new Set(
      bookingsBlockingSlot
        .filter((b: any) => b.therapist_id !== null)
        .map((b: any) => b.therapist_id)
    );

    const slotMinutes = timeToMinutes(slot);
    const availableTherapistCount = scheduledTherapistIds.filter(
      (id: string) => {
        if (busyTherapists.has(id)) return false;
        const schedule = scheduleMap.get(id);
        if (!schedule || schedule.shifts.length === 0) return true;
        return schedule.shifts.some((shift: any) => {
          const shiftStart = timeToMinutes(shift.start + ":00");
          const shiftEnd = timeToMinutes(shift.end + ":00");
          return slotMinutes >= shiftStart && slotMinutes < shiftEnd;
        });
      }
    ).length;

    return availableTherapistCount > 0;
  });

  return c.json({ availableSlots, _debug });
});

export default availability;
