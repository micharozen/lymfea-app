import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type BookingRow = Database['public']['Tables']['bookings']['Row'];

export interface Treatment {
  id?: string;             
  treatment_id?: string;
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
  calendar_color: string | null;
  opening_time: string | null;
  closing_time: string | null;
}

export interface Therapist {
  id: string;
  first_name: string;
  last_name: string;
}

export function useBookingData() {
  const { data: bookings, refetch: refetchBookings } = useQuery({
    queryKey: ["bookings"],
    refetchOnWindowFocus: true,
    staleTime: 30000,
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
            .select(`
              treatment_id,
              treatment_menus (
                name,
                duration,
                price
              )
            `)
            .eq("booking_id", booking.id);

          const treatmentsTotalDuration =
            treatments?.reduce((sum, t: any) => sum + (t.treatment_menus?.duration || 0), 0) || 0;

          const treatmentsTotalPrice =
            treatments?.reduce((sum, t: any) => sum + (t.treatment_menus?.price || 0), 0) || 0;

          const totalDuration = booking.duration && booking.duration > 0
            ? booking.duration
            : treatmentsTotalDuration;

          const treatmentsList = (treatments as any[] | null)
            ?.map((t): Treatment | null => {
              if (!t.treatment_menus) return null;
              return {
                ...t.treatment_menus,
                id: t.treatment_id,
                treatment_id: t.treatment_id
              } as Treatment;
            })
            .filter((m): m is Treatment => m !== null) || [];

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
        .select("id, name, image, currency, calendar_color, opening_time, closing_time")
        .order("name");
      if (error) throw error;
      return data as Hotel[];
    },
  });

  const { data: therapists } = useQuery({
    queryKey: ["therapists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("therapists")
        .select("id, first_name, last_name")
        .eq("status", "active")
        .order("first_name");
      if (error) throw error;
      return data as Therapist[];
    },
  });

  // Realtime subscription for automatic updates
  useEffect(() => {
    const channelName = 'bookings-admin-realtime';

    // 1. On nettoie tout ce qui pourrait traîner pour éviter les conflits de callbacks
    supabase.removeAllChannels();

    // 2. On crée le canal
    const channel = supabase.channel(channelName);

    // 3. On attache l'écouteur AVANT de souscrire (ordre crucial pour Supabase)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bookings' },
      () => {
        // Point 10 Review Michael : Suppression du console.log
        refetchBookings();
      }
    );

    // 4. On lance la souscription
    channel.subscribe();

    // 5. Nettoyage propre au démontage
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchBookings]);

  const getHotelInfo = (hotelId: string | null): Hotel | null => {
    if (!hotelId || !hotels) return null;
    return hotels.find(h => h.id === hotelId) || null;
  };

  return {
    bookings,
    hotels,
    therapists,
    getHotelInfo,
    refetch: refetchBookings,
  };
}