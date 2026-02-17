import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addDays, subDays, format } from 'date-fns';

export interface SessionBooking {
  id: string;
  booking_time: string;
  duration: number;
  client_first_name: string;
  client_last_name: string;
  status: string;
  treatments: Array<{ name: string; duration: number }>;
}

export interface BlockedSlot {
  label: string;
  start_time: string;
  end_time: string;
}

export interface PopularTreatment {
  name: string;
  count: number;
}

export interface SessionData {
  date: string;
  total_slots: number;
  booked_count: number;
  booked_units: number;
  unique_clients: number;
  bookings: SessionBooking[];
  blocked_slots: BlockedSlot[];
  popular_treatments: PopularTreatment[];
}

export interface HotelInfo {
  id: string;
  name: string;
  image: string | null;
  cover_image: string | null;
  venue_type: string;
  opening_time: string;
  closing_time: string;
  timezone: string;
  currency: string;
  slot_interval: number;
}

export interface EnterpriseDashboardData {
  hotel: HotelInfo;
  is_deployed: boolean;
  session: SessionData;
  error?: string;
}

export function useEnterpriseDashboard(hotelId: string | undefined, sessionDate: string) {
  return useQuery({
    queryKey: ['enterprise-dashboard', hotelId, sessionDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_enterprise_session_data', {
        _hotel_id: hotelId!,
        _session_date: sessionDate,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as EnterpriseDashboardData;
    },
    enabled: !!hotelId && !!sessionDate,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAvailableDates(hotelId: string | undefined, referenceDate: Date) {
  const startDate = format(subDays(referenceDate, 180), 'yyyy-MM-dd');
  const endDate = format(addDays(referenceDate, 180), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['enterprise-available-dates', hotelId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_venue_available_dates', {
        _hotel_id: hotelId!,
        _start_date: startDate,
        _end_date: endDate,
      });
      if (error) throw error;
      return (data || []) as string[];
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
