import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      hotelId,
      startDate,
      endDate,
      therapistGender,
      requiredGuestCount: rawGuestCount,
    } = await req.json();
    const requiredGuestCount = Math.max(1, rawGuestCount || 1);

    if (!hotelId || !startDate || !endDate) {
      throw new Error('Missing hotelId, startDate or endDate');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Build list of dates in the range (UTC-safe string iteration)
    const addOneDay = (dateStr: string): string => {
      const d = new Date(dateStr + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    const allDates: string[] = [];
    let cursor = startDate;
    while (cursor <= endDate) {
      allDates.push(cursor);
      cursor = addOneDay(cursor);
    }

    // Early defaults: empty result
    const emptyResult = () =>
      new Response(
        JSON.stringify({ daysWithSlots: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    // Filter to venue-deployed dates via RPC (single call)
    const { data: deployedDates, error: deployedErr } = await supabase.rpc(
      'get_venue_available_dates',
      { _hotel_id: hotelId, _start_date: startDate, _end_date: endDate }
    );
    if (deployedErr) {
      console.error('get_venue_available_dates error:', deployedErr);
      throw deployedErr;
    }
    const deployedSet = new Set<string>(deployedDates || []);
    if (deployedSet.size === 0) return emptyResult();

    // Hotel config
    const { data: hotelData } = await supabase
      .from('hotels')
      .select('opening_time, closing_time, slot_interval, inter_venue_buffer_minutes, room_turnover_buffer_minutes')
      .eq('id', hotelId)
      .single();

    const openingMinutes = hotelData?.opening_time
      ? timeToMinutes(hotelData.opening_time)
      : 6 * 60;
    const closingMinutes = hotelData?.closing_time
      ? timeToMinutes(hotelData.closing_time)
      : 23 * 60;
    const slotInterval = hotelData?.slot_interval || 30;
    const roomTurnoverBuffer = hotelData?.room_turnover_buffer_minutes ?? 0;
    const travelBuffer = hotelData?.inter_venue_buffer_minutes ?? 0;

    // Rooms
    const { data: treatmentRooms } = await supabase
      .from('treatment_rooms')
      .select('id, capacity')
      .eq('hotel_id', hotelId)
      .in('status', ['active', 'Actif']);

    const roomCapacityMap = new Map<string, number>();
    (treatmentRooms || []).forEach((r: any) => {
      roomCapacityMap.set(r.id, r.capacity || 1);
    });
    if (roomCapacityMap.size === 0) return emptyResult();

    // Therapists (active + optional gender filter)
    let therapistQuery = supabase
      .from('therapist_venues')
      .select(`therapist_id, therapists!inner(id, status, skills, gender)`)
      .eq('hotel_id', hotelId);
    if (therapistGender) {
      therapistQuery = therapistQuery.eq('therapists.gender', therapistGender);
    }
    const { data: therapistRows } = await therapistQuery;
    const activeTherapistIds: string[] = (therapistRows || [])
      .filter((h: any) => {
        const s = h.therapists?.status?.toLowerCase();
        return s === 'active' || s === 'actif';
      })
      .map((h: any) => h.therapist_id);
    if (activeTherapistIds.length === 0) return emptyResult();

    // Blocked slots (one fetch)
    const { data: blockedSlots } = await supabase
      .from('venue_blocked_slots')
      .select('start_time, end_time, days_of_week')
      .eq('hotel_id', hotelId)
      .eq('is_active', true);

    // Therapist availability over range
    const { data: availabilityRows } = await supabase
      .from('therapist_availability')
      .select('therapist_id, date, is_available, shifts')
      .gte('date', startDate)
      .lte('date', endDate)
      .in('therapist_id', activeTherapistIds);

    type Schedule = { is_available: boolean; shifts: any[] };
    const scheduleByDate = new Map<string, Map<string, Schedule>>();
    (availabilityRows || []).forEach((s: any) => {
      if (!scheduleByDate.has(s.date)) scheduleByDate.set(s.date, new Map());
      scheduleByDate.get(s.date)!.set(s.therapist_id, {
        is_available: s.is_available,
        shifts: Array.isArray(s.shifts) ? s.shifts : [],
      });
    });

    // Bookings for the venue across the range
    const { data: hotelBookings } = await supabase
      .from('bookings')
      .select('booking_date, booking_time, therapist_id, status, room_id, duration')
      .eq('hotel_id', hotelId)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .not('status', 'in', '("Annulé","Terminé","cancelled")');

    const bookingsByDate = new Map<string, any[]>();
    (hotelBookings || []).forEach((b: any) => {
      if (!bookingsByDate.has(b.booking_date)) bookingsByDate.set(b.booking_date, []);
      bookingsByDate.get(b.booking_date)!.push(b);
    });

    // Cross-venue bookings (only if travelBuffer > 0)
    const crossVenueByDate = new Map<string, any[]>();
    if (travelBuffer > 0) {
      const { data: crossData } = await supabase
        .from('bookings')
        .select('booking_date, booking_time, therapist_id, duration, hotel_id')
        .in('therapist_id', activeTherapistIds)
        .neq('hotel_id', hotelId)
        .gte('booking_date', startDate)
        .lte('booking_date', endDate)
        .not('status', 'in', '("Annulé","Terminé","cancelled")');
      (crossData || []).forEach((b: any) => {
        if (!crossVenueByDate.has(b.booking_date)) crossVenueByDate.set(b.booking_date, []);
        crossVenueByDate.get(b.booking_date)!.push(b);
      });
    }

    // Generate candidate slots (same for every day in the range)
    const timeSlots: string[] = [];
    for (let minutes = openingMinutes; minutes < closingMinutes; minutes += slotInterval) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      timeSlots.push(
        `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`
      );
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const isSlotInBlockedRange = (slot: string, dow: number): boolean => {
      if (!blockedSlots || blockedSlots.length === 0) return false;
      const s = timeToMinutes(slot);
      const e = s + slotInterval;
      return blockedSlots.some((b: any) => {
        if (b.days_of_week !== null && !b.days_of_week.includes(dow)) return false;
        const bs = timeToMinutes(b.start_time);
        const be = timeToMinutes(b.end_time);
        return s < be && e > bs;
      });
    };

    const daysWithSlots: string[] = [];

    for (const date of allDates) {
      if (!deployedSet.has(date)) continue;

      const dow = new Date(date + 'T00:00:00').getDay();
      const bookings = bookingsByDate.get(date) || [];
      const crossBookings = crossVenueByDate.get(date) || [];
      const scheduleMap = scheduleByDate.get(date);

      // Scheduled therapists for this date
      const scheduledTherapistIds = activeTherapistIds.filter((id) => {
        if (!scheduleMap) return true;
        const s = scheduleMap.get(id);
        if (!s) return true;
        return s.is_available;
      });
      if (scheduledTherapistIds.length === 0) continue;

      // Find any slot that works
      const hasAnySlot = timeSlots.some((slot) => {
        if (isSlotInBlockedRange(slot, dow)) return false;

        if (date === todayStr) {
          if (timeToMinutes(slot) <= nowMinutes) return false;
        }

        const slotMinutes = timeToMinutes(slot);

        // Bookings overlapping this slot
        const blocking = bookings.filter((b: any) => {
          const bs = timeToMinutes(b.booking_time);
          const be = bs + (b.duration || 30) + roomTurnoverBuffer;
          return slotMinutes >= bs && slotMinutes < be;
        });

        // Room capacity
        const capacityBookings = blocking.filter((b: any) => b.therapist_id !== null);
        const occupiedRoomIds = new Set<string>();
        let bookingsWithoutRoom = 0;
        for (const b of capacityBookings) {
          if (b.room_id) occupiedRoomIds.add(b.room_id);
          else bookingsWithoutRoom++;
        }
        const allRoomIds = Array.from(roomCapacityMap.keys());
        const freeRoomCapacity =
          allRoomIds
            .filter((id) => !occupiedRoomIds.has(id))
            .reduce((sum, id) => sum + (roomCapacityMap.get(id) || 1), 0) -
          bookingsWithoutRoom;
        if (freeRoomCapacity < requiredGuestCount) return false;

        // Therapist availability
        const busyTherapists = new Set(
          blocking.filter((b: any) => b.therapist_id !== null).map((b: any) => b.therapist_id)
        );
        const availableCount = scheduledTherapistIds.filter((id) => {
          if (busyTherapists.has(id)) return false;

          if (travelBuffer > 0 && crossBookings.length > 0) {
            const blockedCross = crossBookings.some((b: any) => {
              if (b.therapist_id !== id) return false;
              const bs = timeToMinutes(b.booking_time);
              const be = bs + (b.duration || 30);
              return slotMinutes >= bs - travelBuffer && slotMinutes < be + travelBuffer;
            });
            if (blockedCross) return false;
          }

          const schedule = scheduleMap?.get(id);
          if (!schedule || schedule.shifts.length === 0) return true;
          return schedule.shifts.some((shift: any) => {
            const ss = timeToMinutes(shift.start + ':00');
            const se = timeToMinutes(shift.end + ':00');
            return slotMinutes >= ss && slotMinutes < se;
          });
        }).length;

        return availableCount >= requiredGuestCount;
      });

      if (hasAnySlot) daysWithSlots.push(date);
    }

    return new Response(
      JSON.stringify({ daysWithSlots }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('check-availability-range error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
