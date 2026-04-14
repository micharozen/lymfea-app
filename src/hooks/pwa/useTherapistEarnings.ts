import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, eachDayOfInterval, parseISO } from "date-fns";

interface BookingTreatment {
  treatment_menus: {
    name: string;
    price: number;
    duration: number;
  } | null;
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

function calculateDuration(
  booking: { duration: number | null; booking_treatments: BookingTreatment[] }
): number {
  if (booking.duration && booking.duration > 0) {
    return booking.duration;
  }
  if (!booking.booking_treatments || booking.booking_treatments.length === 0) {
    return 60;
  }
  const dur = booking.booking_treatments.reduce(
    (sum, bt) => sum + (bt.treatment_menus?.duration || 0),
    0
  );
  return dur > 0 ? dur : 60;
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

  const { data: hotelsData } = await supabase
    .from("hotels")
    .select("id, therapist_commission")
    .in("id", hotelIds);

  const commissionMap = new Map<string, number>(
    hotelsData?.map((h) => [h.id, h.therapist_commission ?? 70]) || []
  );

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select(
      `*, booking_treatments (treatment_menus (name, price, duration))`
    )
    .eq("therapist_id", therapistId)
    .eq("status", "completed")
    .gte("booking_date", startDate)
    .lte("booking_date", endDate)
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: false });

  const rawBookings = (bookingsData || []) as Array<{
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
  }>;

  const bookings: CompletedBookingDetail[] = rawBookings.map((b) => {
    const commission = commissionMap.get(b.hotel_id) ?? 70;
    const total = calculateTotalPrice(b);
    const therapistShare = Math.round(total * (commission / 100) * 100) / 100;
    const dur = calculateDuration(b);
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
