import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hotelId, date, treatmentIds, therapistGender, requiredGuestCount: rawGuestCount } = await req.json();
    const requiredGuestCount = Math.max(1, rawGuestCount || 1);

    if (!hotelId || !date) {
      throw new Error('Missing hotelId or date');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const _debug: Record<string, any> = {};
    console.log(`[DEBUG] ====== CHECK-AVAILABILITY START ======`);
    console.log(`[DEBUG] hotelId: ${hotelId}, date: ${date}, treatmentIds: ${JSON.stringify(treatmentIds)}, therapistGender: ${therapistGender}`);
    _debug.input = { hotelId, date, treatmentIds, therapistGender };

    // Check if venue is deployed on this date
    const { data: isVenueAvailable, error: scheduleError } = await supabase
      .rpc('is_venue_available_on_date', {
        _hotel_id: hotelId,
        _check_date: date
      });

    console.log(`[DEBUG] is_venue_available_on_date result: ${isVenueAvailable}, error: ${JSON.stringify(scheduleError)}`);

    if (scheduleError) {
      console.error('Error checking venue schedule:', scheduleError);
    }

    _debug.isVenueAvailable = isVenueAvailable;
    _debug.scheduleError = scheduleError;

    // If venue is not deployed on this date, return no slots
    if (isVenueAvailable === false) {
      console.log(`[DEBUG] EARLY EXIT: venue not deployed on ${date}`);
      return new Response(
        JSON.stringify({
          availableSlots: [],
          reason: 'venue_not_deployed',
          _debug
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get hotel opening/closing hours and slot interval
    const { data: hotelData, error: hotelError } = await supabase
      .from('hotels')
      .select('opening_time, closing_time, slot_interval, inter_venue_buffer_minutes, room_turnover_buffer_minutes')
      .eq('id', hotelId)
      .single();

    if (hotelError) {
      console.error('Error fetching hotel:', hotelError);
    }

    // Parse full opening/closing times (HH:MM), defaulting to 06:00 and 23:00 if not set
    const openingMinutes = hotelData?.opening_time
      ? parseInt(hotelData.opening_time.split(':')[0], 10) * 60
        + parseInt(hotelData.opening_time.split(':')[1] || '0', 10)
      : 6 * 60;
    const closingMinutes = hotelData?.closing_time
      ? parseInt(hotelData.closing_time.split(':')[0], 10) * 60
        + parseInt(hotelData.closing_time.split(':')[1] || '0', 10)
      : 23 * 60;

    const slotInterval = hotelData?.slot_interval || 30;
    const roomTurnoverBuffer = hotelData?.room_turnover_buffer_minutes ?? 0;

    const openingDisplay = `${Math.floor(openingMinutes / 60)}:${(openingMinutes % 60).toString().padStart(2, '0')}`;
    const closingDisplay = `${Math.floor(closingMinutes / 60)}:${(closingMinutes % 60).toString().padStart(2, '0')}`;
    console.log(`Venue hours: ${openingDisplay} - ${closingDisplay}, slot interval: ${slotInterval}min`);
    _debug.hotelData = hotelData;
    _debug.openingMinutes = openingMinutes;
    _debug.closingMinutes = closingMinutes;
    _debug.slotInterval = slotInterval;

    // Fetch active blocked slots for this hotel
    const { data: blockedSlots, error: blockedSlotsError } = await supabase
      .from('venue_blocked_slots')
      .select('start_time, end_time, days_of_week')
      .eq('hotel_id', hotelId)
      .eq('is_active', true);

    console.log(`[DEBUG] blocked slots query result: data=${JSON.stringify(blockedSlots)}, error=${JSON.stringify(blockedSlotsError)}`);

    if (blockedSlotsError) {
      console.error('Error fetching blocked slots:', blockedSlotsError);
    }

    // Get day of week for the requested date (0=Sunday, matches PostgreSQL DOW and JS getDay())
    const requestedDayOfWeek = new Date(date + 'T00:00:00').getDay();

    console.log(`[DEBUG] requestedDayOfWeek: ${requestedDayOfWeek}, blockedSlots count: ${blockedSlots?.length || 0}`);

    // Get the maximum lead_time and categories from selected treatments (if provided)
    let maxLeadTime = 0;
    const requiredCategories = new Set<string>();
    if (treatmentIds && treatmentIds.length > 0) {
      const { data: treatments, error: treatmentsError } = await supabase
        .from('treatment_menus')
        .select('lead_time, category')
        .in('id', treatmentIds);

      if (treatmentsError) {
        console.error('Error fetching treatments:', treatmentsError);
      } else if (treatments && treatments.length > 0) {
        maxLeadTime = Math.max(...treatments.map(t => t.lead_time || 0));
        console.log(`Maximum lead_time from selected treatments: ${maxLeadTime} minutes`);
        // Build set of required categories from selected treatments
        treatments.forEach((t: any) => {
          if (t.category) requiredCategories.add(t.category);
        });
      }
    }
    console.log(`[DEBUG] requiredCategories: ${JSON.stringify([...requiredCategories])}`);
    _debug.requiredCategories = [...requiredCategories];

    // Get all active therapists for this hotel (with optional gender filter)
    let therapistQuery = supabase
      .from('therapist_venues')
      .select(`
        therapist_id,
        therapists!inner(
          id,
          status,
          skills,
          gender
        )
      `)
      .eq('hotel_id', hotelId);

    if (therapistGender) {
      therapistQuery = therapistQuery.eq('therapists.gender', therapistGender);
    }

    const { data: therapists, error: therapistsError } = await therapistQuery;

    console.log(`[DEBUG] therapist_venues raw result: ${JSON.stringify(therapists)}, error: ${JSON.stringify(therapistsError)}`);
    _debug.therapistsRaw = therapists;
    _debug.therapistsError = therapistsError;

    // Filter active therapists (case-insensitive, supports both EN "active" and FR "actif")
    const activeTherapists = therapists?.filter((h: any) => {
      const status = h.therapists?.status?.toLowerCase();
      return status === 'active' || status === 'actif';
    }) || [];

    console.log(`[DEBUG] activeTherapists after filter: ${JSON.stringify(activeTherapists)}`);
    _debug.activeTherapists = activeTherapists;

    if (therapistsError) {
      console.error('Error fetching therapists:', therapistsError);
      throw therapistsError;
    }

    // Filter therapists by category/skills matching
    // If no categories required, all active therapists qualify
    // If therapist has no skills assigned (null/empty), they qualify (backward compat)
    // Otherwise, therapist must have at least one skill matching a required category
    const qualifiedTherapists = requiredCategories.size === 0
      ? activeTherapists
      : activeTherapists.filter((h: any) => {
          const skills: string[] | null = h.therapists?.skills;
          if (!skills || skills.length === 0) return true; // backward compat
          return [...requiredCategories].some(cat => skills.includes(cat));
        });

    console.log(`[DEBUG] qualifiedTherapists after category filter: ${qualifiedTherapists.length}/${activeTherapists.length}`);
    _debug.qualifiedTherapists = qualifiedTherapists.length;

    // Get treatment rooms with capacity for this hotel (CAPACITY CONSTRAINT)
    const { data: treatmentRooms, error: roomsError } = await supabase
      .from('treatment_rooms')
      .select('id, capacity')
      .eq('hotel_id', hotelId)
      .in('status', ['active', 'Actif']);

    if (roomsError) {
      console.error('Error fetching treatment rooms:', roomsError);
      throw roomsError;
    }

    const totalRooms = treatmentRooms?.length || 0;
    const roomCapacityMap = new Map<string, number>();
    (treatmentRooms || []).forEach((r: any) => {
      roomCapacityMap.set(r.id, r.capacity || 1);
    });
    console.log(`[DEBUG] treatment_rooms: ${JSON.stringify(treatmentRooms)}, totalRooms: ${totalRooms}`);
    _debug.treatmentRooms = treatmentRooms;
    _debug.totalRooms = totalRooms;

    // If no treatment rooms, no availability
    if (totalRooms === 0) {
      console.log('[DEBUG] EARLY EXIT: no active treatment rooms');
      _debug.earlyExit = 'no_active_treatment_rooms';
      return new Response(
        JSON.stringify({ availableSlots: [], _debug }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!qualifiedTherapists || qualifiedTherapists.length === 0) {
      console.log('[DEBUG] EARLY EXIT: no qualified therapists (active + category match)');
      _debug.earlyExit = 'no_qualified_therapists';
      return new Response(
        JSON.stringify({ availableSlots: [], _debug }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const therapistIds = qualifiedTherapists.map((h: any) => h.therapist_id);
    console.log(`Found ${therapistIds.length} qualified therapists (active + category)`);

    // THERAPIST SCHEDULE CHECK: Filter by therapist_availability table
    const { data: therapistSchedules, error: scheduleCheckError } = await supabase
      .from('therapist_availability')
      .select('therapist_id, is_available, shifts')
      .eq('date', date)
      .in('therapist_id', therapistIds);

    if (scheduleCheckError) {
      console.error('Error fetching therapist schedules:', scheduleCheckError);
    }

    // Build schedule map: therapist_id -> { is_available, shifts }
    const scheduleMap = new Map<string, { is_available: boolean; shifts: any[] }>();
    (therapistSchedules || []).forEach((s: any) => {
      scheduleMap.set(s.therapist_id, {
        is_available: s.is_available,
        shifts: Array.isArray(s.shifts) ? s.shifts : [],
      });
    });

    // Filter therapists: available if schedule says available OR no schedule data (backward compat)
    const scheduledTherapistIds = therapistIds.filter((id: string) => {
      const schedule = scheduleMap.get(id);
      if (!schedule) return true; // No schedule data = available (transition period)
      return schedule.is_available;
    });

    console.log(`[DEBUG] therapists after schedule filter: ${scheduledTherapistIds.length}/${therapistIds.length}`);
    _debug.scheduledTherapistIds = scheduledTherapistIds;
    _debug.therapistSchedules = therapistSchedules;

    if (scheduledTherapistIds.length === 0) {
      console.log('[DEBUG] EARLY EXIT: no therapists available per schedule');
      _debug.earlyExit = 'no_therapists_per_schedule';
      return new Response(
        JSON.stringify({ availableSlots: [], _debug }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all bookings for this hotel on this date (for trunk capacity check)
    // Exclude cancelled/terminated bookings
    // Include duration for overlap checking
    const { data: allHotelBookings, error: allBookingsError } = await supabase
      .from('bookings')
      .select('booking_time, therapist_id, status, room_id, duration')
      .eq('booking_date', date)
      .eq('hotel_id', hotelId)
      .not('status', 'in', '("Annulé","Terminé","cancelled")');

    if (allBookingsError) {
      console.error('Error fetching hotel bookings:', allBookingsError);
      throw allBookingsError;
    }

    console.log(`[DEBUG] active bookings on ${date}: ${JSON.stringify(allHotelBookings)}`);
    _debug.activeBookings = allHotelBookings;

    // Fetch cross-venue bookings for travel buffer enforcement
    const travelBuffer = hotelData?.inter_venue_buffer_minutes ?? 0;
    let crossVenueBookings: any[] = [];
    if (travelBuffer > 0 && scheduledTherapistIds.length > 0) {
      const { data: crossVenueData, error: crossVenueError } = await supabase
        .from('bookings')
        .select('booking_time, therapist_id, duration, hotel_id')
        .eq('booking_date', date)
        .in('therapist_id', scheduledTherapistIds)
        .neq('hotel_id', hotelId)
        .not('status', 'in', '("Annulé","Terminé","cancelled")');

      if (crossVenueError) {
        console.error('Error fetching cross-venue bookings:', crossVenueError);
      }
      crossVenueBookings = crossVenueData || [];
      console.log(`[DEBUG] cross-venue bookings (buffer=${travelBuffer}min): ${crossVenueBookings.length}`);
      _debug.crossVenueBookings = crossVenueBookings;
      _debug.travelBuffer = travelBuffer;
    }

    // Helper function to convert time string to minutes
    const timeToMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    // Function to check if a slot is blocked by an existing booking (considering duration + turnover buffer)
    const isSlotBlockedByBooking = (
      slotTime: string,
      bookingTime: string,
      bookingDuration: number,
      turnoverMinutes: number = 0
    ): boolean => {
      const slotMinutes = timeToMinutes(slotTime);
      const bookingStartMinutes = timeToMinutes(bookingTime);
      const bookingEndMinutes = bookingStartMinutes + (bookingDuration || 30) + turnoverMinutes;

      // The slot is blocked if it falls during the booking duration (+ turnover buffer)
      return slotMinutes >= bookingStartMinutes && slotMinutes < bookingEndMinutes;
    };

    // Function to check if a slot overlaps with any blocked time range
    const isSlotInBlockedRange = (slotTime: string): boolean => {
      if (!blockedSlots || blockedSlots.length === 0) return false;

      const slotStartMinutes = timeToMinutes(slotTime);
      const slotEndMinutes = slotStartMinutes + slotInterval;

      return blockedSlots.some((block: any) => {
        // Check day of week applicability
        if (block.days_of_week !== null && !block.days_of_week.includes(requestedDayOfWeek)) {
          return false;
        }

        const blockStartMinutes = timeToMinutes(block.start_time);
        const blockEndMinutes = timeToMinutes(block.end_time);

        // A slot is blocked if any part of it overlaps with the blocked range
        return slotStartMinutes < blockEndMinutes && slotEndMinutes > blockStartMinutes;
      });
    };

    // Generate time slots based on venue opening hours and slot interval
    const timeSlots = [];
    for (let minutes = openingMinutes; minutes < closingMinutes; minutes += slotInterval) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const time24 = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
      timeSlots.push(time24);
    }

    console.log(`[DEBUG] generated ${timeSlots.length} time slots: ${openingDisplay} - ${closingDisplay} => [${timeSlots[0]} ... ${timeSlots[timeSlots.length - 1]}]`);

    // Calculate the earliest bookable time based on lead_time
    const now = new Date();
    const requestedDate = new Date(date);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isToday = requestedDate.getTime() === today.getTime();
    
    let earliestBookableTime: string | null = null;
    if (isToday && maxLeadTime > 0) {
      // Add lead_time to current time
      const earliestTime = new Date(now.getTime() + maxLeadTime * 60 * 1000);
      const earliestHour = earliestTime.getHours();
      const earliestMinute = earliestTime.getMinutes();
      // Round up to next slot interval
      const totalEarliestMinutes = earliestHour * 60 + earliestMinute;
      const roundedMinutes = Math.ceil(totalEarliestMinutes / slotInterval) * slotInterval;
      const roundedHour = Math.floor(roundedMinutes / 60);
      const roundedMinute = roundedMinutes % 60;
      earliestBookableTime = `${roundedHour.toString().padStart(2, '0')}:${roundedMinute.toString().padStart(2, '0')}:00`;
      console.log(`Lead time filter: earliest bookable slot is ${earliestBookableTime} (current time + ${maxLeadTime} min)`);
    }

    // Check which slots have availability (both therapist AND room)
    const availableSlots = timeSlots.filter(slot => {
      // Filter out slots that fall in blocked time ranges (e.g., lunch breaks)
      if (isSlotInBlockedRange(slot)) {
        return false;
      }

      // Filter out slots that are too soon based on lead_time (only for today)
      if (isToday && earliestBookableTime && slot < earliestBookableTime) {
        return false;
      }

      // Get bookings that block this slot (considering duration overlap + room turnover buffer)
      const bookingsBlockingSlot = (allHotelBookings || []).filter((b: any) =>
        isSlotBlockedByBooking(slot, b.booking_time, b.duration || 30, roomTurnoverBuffer)
      );

      // ROOM CAPACITY CHECK: account for room capacity (duo rooms can serve 2 guests).
      // A room with capacity >= requiredGuestCount can serve the entire group.
      // Otherwise, sum available capacity across free rooms.
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

      // Calculate free capacity: sum capacity of free rooms
      const allRoomIds = Array.from(roomCapacityMap.keys());
      const freeRoomIds = allRoomIds.filter(id => !occupiedRoomIds.has(id));
      const freeRoomCapacity = freeRoomIds.reduce(
        (sum, id) => sum + (roomCapacityMap.get(id) || 1), 0
      ) - bookingsWithoutRoom;

      if (freeRoomCapacity < requiredGuestCount) {
        return false;
      }

      // THERAPIST CHECK: At least one therapist must be free AND within their shift hours
      const busyTherapists = new Set(
        bookingsBlockingSlot
          .filter((b: any) => b.therapist_id !== null)
          .map((b: any) => b.therapist_id)
      );

      const slotMinutes = timeToMinutes(slot);

      // Count therapists who are: scheduled for this time slot AND not busy with a booking
      const availableTherapistCount = scheduledTherapistIds.filter((id: string) => {
        if (busyTherapists.has(id)) return false;

        // Check cross-venue travel buffer: therapist blocked if they have a booking
        // at another venue within the travel buffer window
        if (travelBuffer > 0) {
          const isCrossVenueBlocked = crossVenueBookings.some((b: any) => {
            if (b.therapist_id !== id) return false;
            const bStart = timeToMinutes(b.booking_time);
            const bEnd = bStart + (b.duration || 30);
            return slotMinutes >= (bStart - travelBuffer) && slotMinutes < (bEnd + travelBuffer);
          });
          if (isCrossVenueBlocked) return false;
        }

        // Check if slot falls within one of the therapist's shifts
        const schedule = scheduleMap.get(id);
        if (!schedule || schedule.shifts.length === 0) {
          // No shift data (backward compat): available all day
          return true;
        }

        return schedule.shifts.some((shift: any) => {
          const shiftStart = timeToMinutes(shift.start + ':00');
          const shiftEnd = timeToMinutes(shift.end + ':00');
          return slotMinutes >= shiftStart && slotMinutes < shiftEnd;
        });
      }).length;

      return availableTherapistCount >= requiredGuestCount;
    });

    console.log(`[DEBUG] ====== RESULT: ${availableSlots.length} available out of ${timeSlots.length} ======`);
    _debug.timeSlotsGenerated = timeSlots.length;
    _debug.isToday = isToday;
    _debug.earliestBookableTime = earliestBookableTime;
    _debug.now = now.toISOString();
    _debug.blockedSlotsData = blockedSlots;
    _debug.therapistIds = therapistIds;

    return new Response(
      JSON.stringify({ availableSlots, _debug }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-availability:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});