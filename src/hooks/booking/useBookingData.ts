import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import {
  bookingKeys,
  listBookings,
  type BookingListItem,
  type BookingTreatment,
  type OrgScope,
} from "@shared/db";

export type Treatment = BookingTreatment;
export type BookingWithTreatments = BookingListItem;

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

export interface UseBookingDataOptions {
  /** ISO date (YYYY-MM-DD). Only bookings with booking_date >= fromDate are fetched. */
  fromDate?: string;
}

export function useBookingData(options: UseBookingDataOptions = {}) {
  const { fromDate } = options;
  const { isSuperAdmin, organizationId, activeOrganizationId, hasChosenActiveOrganization } =
    useUser();

  // Resolve org scope. Regular admins: always their own org. Super-admins:
  // active org if picked, otherwise explicit "view all" (only possible for super-admins).
  const scope = useMemo<OrgScope | null>(() => {
    if (!isSuperAdmin) {
      return organizationId ? { organizationId } : null;
    }
    if (activeOrganizationId) return { organizationId: activeOrganizationId };
    if (hasChosenActiveOrganization) return { allOrganizations: true };
    return null;
  }, [isSuperAdmin, organizationId, activeOrganizationId, hasChosenActiveOrganization]);

  const filters = useMemo(() => (fromDate ? { fromDate } : {}), [fromDate]);

  const { data: bookings, refetch: refetchBookings } = useQuery({
    queryKey: scope ? bookingKeys.list(scope, filters) : ["bookings", "disabled"],
    enabled: !!scope,
    refetchOnWindowFocus: true,
    staleTime: 30000,
    queryFn: () => listBookings(supabase, scope!, filters),
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

    // Remove any stale channel with this name before creating a new one.
    // Needed because React Strict Mode runs effects twice and supabase.channel()
    // returns the same (already-subscribed) object when given the same name,
    // causing "cannot add callbacks after subscribe()" errors.
    const stale = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (stale) supabase.removeChannel(stale);

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
