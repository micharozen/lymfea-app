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
  // Ajout pour que TypeScript connaisse la relation des soins duo
  booking_therapists?: { status: string; therapist_id: string }[];
  booking_payment_infos?: { payment_status: string | null; stripe_payment_method_id: string | null } | null;
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
      const { data: bookingsData, error: bookingsError } = await (supabase as any)
        .from("bookings")
        .select(`
          *,
          booking_therapists(status, therapist_id),
          booking_treatments(
            treatment_id,
            variant_id,
            treatment_menus(name, duration, price),
            treatment_variants(id, label, duration, price)
          ),
          booking_payment_infos(payment_status, stripe_payment_method_id)
        `)
        .order("booking_date", { ascending: true })
        .order("booking_time", { ascending: true });

      if (bookingsError) throw bookingsError;

      return (bookingsData || []).map((booking: any) => {
        const treatments: any[] = booking.booking_treatments || [];

        const treatmentsTotalDuration = treatments.reduce(
          (sum, t) => sum + (t.treatment_menus?.duration || 0),
          0,
        );
        const treatmentsTotalPrice = treatments.reduce(
          (sum, t) => sum + (t.treatment_menus?.price || 0),
          0,
        );

          const totalDuration = booking.duration && booking.duration > 0
            ? booking.duration
            : treatmentsTotalDuration;

          const treatmentsList = (treatments as any[] | null)
            ?.map((t): Treatment | null => {
              if (!t.treatment_menus) return null;
              const variant = t.treatment_variants || null;
              const variantSuffix = variant?.label ? ` · ${variant.label}` : '';
              return {
                ...t.treatment_menus,
                id: t.treatment_id,
                treatment_id: t.treatment_id,
                name: t.treatment_menus.name + variantSuffix,
                duration: variant?.duration ?? t.treatment_menus.duration,
                price: variant?.price ?? t.treatment_menus.price,
              } as Treatment;
            })
            .filter((m): m is Treatment => m !== null) || [];

          const paymentInfos = Array.isArray(booking.booking_payment_infos)
            ? booking.booking_payment_infos[0] ?? null
            : booking.booking_payment_infos ?? null;

          return {
            ...booking,
            totalDuration,
            treatmentsTotalDuration,
            treatmentsTotalPrice,
            treatments: treatmentsList,
            booking_therapists: booking.booking_therapists || [], // On s'assure de bien le passer à l'UI
            booking_payment_infos: paymentInfos,
          } as BookingWithTreatments;
      });
    },
  });

  const { data: hotels, refetch: refetchHotels } = useQuery({
    queryKey: ["hotels", "booking-calendar"],
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

    const channel = supabase.channel(channelName);

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bookings' },
      () => { refetchBookings(); }
    );

    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'hotels' },
      () => { refetchHotels(); }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchBookings, refetchHotels]);

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