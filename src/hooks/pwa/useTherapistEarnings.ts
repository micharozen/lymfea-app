import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { type TherapistRates } from "@/lib/therapistEarnings";
import { myLegDuration, estimateTherapistShare } from "@/lib/therapistLegDuration";

interface BookingTreatment {
  therapist_id: string | null;
  is_addon: boolean;
  treatment_menus: {
    name: string;
    price: number;
    duration: number;
  } | null;
}

interface BookingTherapistRow {
  therapist_id: string;
  status: string;
  assigned_at: string | null;
}

export interface CompletedBookingDetail {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  hotel_name: string | null;
  hotel_id: string;
  total_price: number | null;
  duration: number | null;
  payment_status: string | null;
  booking_treatments: BookingTreatment[];
  therapistShare: number;
  calculatedTotal: number;
  calculatedDuration: number;
}

export interface DailyEarnings {
  date: string;
  earnings: number;
  count: number;
}

export interface EarningsSummary {
  totalEarned: number;
  bookingCount: number;
  hoursWorked: number;
  averagePerBooking: number;
  dailyData: DailyEarnings[];
  bookings: CompletedBookingDetail[];
}

function calculateTotalPrice(
  booking: { total_price: number | null; booking_treatments: BookingTreatment[] }
): number {
  if (booking.total_price && booking.total_price > 0) {
    return booking.total_price;
  }
  if (!booking.booking_treatments || booking.booking_treatments.length === 0) {
    return 0;
  }
  return booking.booking_treatments.reduce(
    (sum, bt) => sum + (bt.treatment_menus?.price || 0),
    0
  );
}

async function fetchTherapistEarnings(
  therapistId: string,
  startDate: string,
  endDate: string
): Promise<EarningsSummary> {
  const { data: affiliatedVenues } = await supabase
    .from("therapist_venues")
    .select("hotel_id")
    .eq("therapist_id", therapistId);

  const hotelIds = affiliatedVenues?.map((v) => v.hotel_id) || [];

  if (hotelIds.length === 0) {
    return {
      totalEarned: 0,
      bookingCount: 0,
      hoursWorked: 0,
      averagePerBooking: 0,
      dailyData: [],
      bookings: [],
    };
  }

  const { data: therapistData } = await supabase
    .from("therapists")
    .select("rate_45, rate_60, rate_75, rate_90, rate_105, rate_120, rate_150")
    .eq("id", therapistId)
    .single();

  const therapistRates: TherapistRates | null = therapistData ?? null;

  // Commission mode + out-of-hours surcharge live on the venue (hotels), not on
  // the booking — mirror BookingDetail so the estimate matches the payout.
  const { data: hotelsData } = await supabase
    .from("hotels")
    .select("id, global_therapist_commission, therapist_commission, out_of_hours_surcharge_percent")
    .in("id", hotelIds);

  const hotelSettings = new Map(
    (hotelsData || []).map((h) => [
      h.id,
      {
        globalTherapistCommission: h.global_therapist_commission === true,
        therapistCommission: h.therapist_commission,
        surchargePercent: h.out_of_hours_surcharge_percent,
      },
    ]),
  );

  const bookingSelect =
    `*, booking_treatments (therapist_id, is_addon, treatment_menus (name, price, duration)), booking_therapists (therapist_id, status, assigned_at)`;

  // Bookings where I'm the primary therapist.
  const { data: primaryData } = await supabase
    .from("bookings")
    .select(bookingSelect)
    .eq("therapist_id", therapistId)
    .eq("status", "completed")
    .gte("booking_date", startDate)
    .lte("booking_date", endDate);

  // Duo bookings where I'm a secondary therapist (booking.therapist_id points
  // at someone else, my participation lives in booking_therapists).
  const { data: secondaryLinks } = await supabase
    .from("booking_therapists")
    .select("booking_id")
    .eq("therapist_id", therapistId)
    .eq("status", "accepted");

  const primaryIds = new Set((primaryData || []).map((b) => b.id));
  const secondaryIds = ((secondaryLinks ?? []) as { booking_id: string }[])
    .map((l) => l.booking_id)
    .filter((id) => !primaryIds.has(id));

  let secondaryData: unknown[] = [];
  if (secondaryIds.length > 0) {
    const { data } = await supabase
      .from("bookings")
      .select(bookingSelect)
      .in("id", secondaryIds)
      .eq("status", "completed")
      .gte("booking_date", startDate)
      .lte("booking_date", endDate);
    secondaryData = data || [];
  }

  const rawBookings = [...(primaryData || []), ...secondaryData] as Array<{
    id: string;
    booking_id: number;
    booking_date: string;
    booking_time: string;
    client_first_name: string;
    client_last_name: string;
    hotel_name: string | null;
    hotel_id: string;
    total_price: number | null;
    duration: number | null;
    payment_status: string | null;
    guest_count: number | null;
    is_out_of_hours: boolean | null;
    booking_treatments: BookingTreatment[];
    booking_therapists: BookingTherapistRow[];
  }>;

  rawBookings.sort((a, b) => {
    if (a.booking_date !== b.booking_date) return a.booking_date < b.booking_date ? 1 : -1;
    return (a.booking_time || "") < (b.booking_time || "") ? 1 : -1;
  });

  const bookings: CompletedBookingDetail[] = rawBookings.map((b) => {
    const total = calculateTotalPrice(b);
    const orderedIds = (b.booking_therapists ?? [])
      .filter((bt) => bt.status === "accepted")
      .sort((x, y) => (x.assigned_at || "").localeCompare(y.assigned_at || ""))
      .map((bt) => bt.therapist_id);
    const gc = b.guest_count ?? 1;
    const legTreatments = (b.booking_treatments ?? []).map((t) => ({
      therapist_id: t.therapist_id ?? null,
      duration: t.treatment_menus?.duration ?? null,
      is_addon: t.is_addon ?? false,
    }));
    let dur = myLegDuration(therapistId, legTreatments, orderedIds, gc);
    // Solo: preserve the previous behaviour — prefer the stored booking duration
    // (e.g. extended bookings), floor at 60 when no data. Duos use the leg above.
    if (gc <= 1) {
      if ((b.duration ?? 0) > 0) dur = b.duration!;
      else if (dur <= 0) dur = 60;
    }
    const hotel = hotelSettings.get(b.hotel_id);
    const surchargePercent = b.is_out_of_hours
      ? Number(hotel?.surchargePercent) || 0
      : 0;
    const therapistShare = estimateTherapistShare({
      globalTherapistCommission: hotel?.globalTherapistCommission ?? false,
      guestCount: gc,
      legDuration: dur,
      myRates: therapistRates,
      grossPrice: total,
      therapistCommissionPercent: hotel?.therapistCommission ?? null,
      surchargePercent,
    });
    return {
      ...b,
      therapistShare,
      calculatedTotal: total,
      calculatedDuration: dur,
    };
  });

  const totalEarned = bookings.reduce((s, b) => s + b.therapistShare, 0);
  const totalMinutes = bookings.reduce((s, b) => s + b.calculatedDuration, 0);
  const bookingCount = bookings.length;
  const hoursWorked = Math.round((totalMinutes / 60) * 10) / 10;
  const averagePerBooking =
    bookingCount > 0 ? Math.round((totalEarned / bookingCount) * 100) / 100 : 0;

  const dailyMap = new Map<string, { earnings: number; count: number }>();
  const days = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  });
  for (const day of days) {
    dailyMap.set(format(day, "yyyy-MM-dd"), { earnings: 0, count: 0 });
  }

  for (const b of bookings) {
    const entry = dailyMap.get(b.booking_date);
    if (entry) {
      entry.earnings += b.therapistShare;
      entry.count += 1;
    }
  }

  const dailyData: DailyEarnings[] = Array.from(dailyMap.entries()).map(
    ([date, data]) => ({
      date,
      earnings: Math.round(data.earnings * 100) / 100,
      count: data.count,
    })
  );

  return {
    totalEarned: Math.round(totalEarned * 100) / 100,
    bookingCount,
    hoursWorked,
    averagePerBooking,
    dailyData,
    bookings,
  };
}

export function useTherapistEarnings(
  therapistId: string | undefined,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: ["therapist-earnings", therapistId, startDate, endDate],
    queryFn: () => fetchTherapistEarnings(therapistId!, startDate, endDate),
    enabled: !!therapistId && !!startDate && !!endDate,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}
