import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type BookingRow = Database['public']['Tables']['bookings']['Row'];

export interface Treatment {
  name: string;
  duration: number | null;
  price: number | null;
}

export interface BookingWithTreatments extends BookingRow {
  totalDuration: number;
  treatmentsTotalDuration: number;
  treatmentsTotalPrice: number;
  treatments: Treatment[];
}

interface BookingTreatmentJoin {
  treatment_id: string;
  treatment_menus: Treatment | null;
}

export interface Hotel {
  id: string;
  name: string;
  image: string | null;
  currency: string | null;
}

export interface Hairdresser {
  id: string;
  first_name: string;
  last_name: string;
}

export function useBookingData() {
  const { data: bookings } = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const { data: bookingsData, error: bookingsError } = await supabase
        .from("bookings")
        .select("*")
        .order("booking_date", { ascending: true })
        .order("booking_time", { ascending: true });

      if (bookingsError) throw bookingsError;

      const bookingsWithDuration = await Promise.all(
        (bookingsData || []).map(async (booking) => {
          const { data: treatments } = await supabase
            .from("booking_treatments")
            .select(
              `
              treatment_id,
              treatment_menus (
                name,
                duration,
                price
              )
            `,
            )
            .eq("booking_id", booking.id);

          const treatmentsTotalDuration =
            treatments?.reduce((sum, t: BookingTreatmentJoin) => sum + (t.treatment_menus?.duration || 0), 0) || 0;

          const treatmentsTotalPrice =
            treatments?.reduce((sum, t: BookingTreatmentJoin) => sum + (t.treatment_menus?.price || 0), 0) || 0;

          const totalDuration = booking.duration && booking.duration > 0
            ? booking.duration
            : treatmentsTotalDuration;

          const treatmentsList = (treatments as BookingTreatmentJoin[] | null)?.map((t) => t.treatment_menus).filter((m): m is Treatment => m !== null) || [];

          return {
            ...booking,
            totalDuration,
            treatmentsTotalDuration,
            treatmentsTotalPrice,
            treatments: treatmentsList,
          };
        }),
      );

      return bookingsWithDuration;
    },
  });

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, image, currency")
        .order("name");
      if (error) throw error;
      return data as Hotel[];
    },
  });

  const { data: hairdressers } = useQuery({
    queryKey: ["hairdressers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hairdressers")
        .select("id, first_name, last_name")
        .eq("status", "active")
        .order("first_name");
      if (error) throw error;
      return data as Hairdresser[];
    },
  });

  const getHotelInfo = (hotelId: string | null): Hotel | null => {
    if (!hotelId || !hotels) return null;
    return hotels.find(h => h.id === hotelId) || null;
  };

  return {
    bookings,
    hotels,
    hairdressers,
    getHotelInfo,
  };
}
