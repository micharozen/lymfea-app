import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAmenityLabel, getAmenityType } from "@/lib/amenityTypes";
import type { VenueAmenity } from "@/hooks/useVenueAmenities";

export interface AmenityBookingForCalendar {
  id: string;
  venue_amenity_id: string;
  amenity_name: string;
  amenity_color: string;
  amenity_icon: string;
  amenity_type: string;
  hotel_id: string;
  booking_date: string;
  booking_time: string;
  duration: number;
  end_time: string;
  client_type: "external" | "internal" | "lymfea";
  customer: {
    first_name: string;
    last_name: string | null;
    phone: string;
  } | null;
  room_number: string | null;
  num_guests: number;
  capacity_total: number;
  status: string;
  price: number;
  notes: string | null;
  linked_booking_id: string | null;
}

interface UseAmenityBookingDataOptions {
  hotelFilter?: string;
  venueAmenities?: VenueAmenity[];
}

export function useAmenityBookingData({ hotelFilter, venueAmenities = [] }: UseAmenityBookingDataOptions) {
  const queryClient = useQueryClient();

  const { data: amenityBookings = [], isLoading } = useQuery({
    queryKey: ["amenity-bookings", hotelFilter],
    queryFn: async () => {
      let query = supabase
        .from("amenity_bookings")
        .select(`
          *,
          customers:customer_id (first_name, last_name, phone),
          venue_amenities:venue_amenity_id (type, name, color, capacity_per_slot)
        `)
        .neq("status", "cancelled")
        .order("booking_date", { ascending: true })
        .order("booking_time", { ascending: true });

      if (hotelFilter && hotelFilter !== "all") {
        query = query.eq("hotel_id", hotelFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).map((row: any): AmenityBookingForCalendar => {
        const va = row.venue_amenities;
        const typeDef = va ? getAmenityType(va.type) : null;

        return {
          id: row.id,
          venue_amenity_id: row.venue_amenity_id,
          amenity_name: va?.name || (va ? getAmenityLabel(va.type, "fr") : ""),
          amenity_color: va?.color || "#3b82f6",
          amenity_icon: typeDef?.icon?.displayName || va?.type || "",
          amenity_type: va?.type || "",
          hotel_id: row.hotel_id,
          booking_date: row.booking_date,
          booking_time: row.booking_time,
          duration: row.duration,
          end_time: row.end_time,
          client_type: row.client_type,
          customer: row.customers || null,
          room_number: row.room_number,
          num_guests: row.num_guests,
          capacity_total: va?.capacity_per_slot || 0,
          status: row.status,
          price: parseFloat(row.price) || 0,
          notes: row.notes,
          linked_booking_id: row.linked_booking_id,
        };
      });
    },
    staleTime: 30_000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("amenity-bookings-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "amenity_bookings" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["amenity-bookings"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const getAmenityBookingsForDay = (date: Date): AmenityBookingForCalendar[] => {
    const dateStr = date.toISOString().split("T")[0];
    return amenityBookings.filter((b) => b.booking_date === dateStr);
  };

  return {
    amenityBookings,
    isLoading,
    getAmenityBookingsForDay,
  };
}
