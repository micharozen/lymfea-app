import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import {
  bookingKeys,
  listBookings,
  type BookingListItem,
  type BookingTreatment,
  type OrgScope,
} from "@shared/db";
import { useCalendarHotels, type Hotel } from "./useCalendarHotels";
import { useActiveTherapists, type Therapist } from "./useActiveTherapists";

export type Treatment = BookingTreatment;
export type BookingWithTreatments = BookingListItem;

export type { Hotel, Therapist };

export interface UseBookingDataOptions {
  /** ISO date (YYYY-MM-DD). Only bookings with booking_date >= fromDate are fetched. */
  fromDate?: string;
  /** ISO date (YYYY-MM-DD). Caps the window at booking_date <= toDate. */
  toDate?: string;
}

export function useBookingData(options: UseBookingDataOptions = {}) {
  const { fromDate, toDate } = options;
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

  const filters = useMemo(
    () => ({ ...(fromDate ? { fromDate } : {}), ...(toDate ? { toDate } : {}) }),
    [fromDate, toDate],
  );

  const {
    data: bookings,
    refetch: refetchBookings,
    isLoading,
  } = useQuery({
    queryKey: scope ? bookingKeys.list(scope, filters) : ["bookings", "disabled"],
    enabled: !!scope,
    staleTime: 30000,
    queryFn: () => listBookings(supabase, scope!, filters),
  });

  const { data: hotels, refetch: refetchHotels } = useCalendarHotels();
  const { data: therapists } = useActiveTherapists();

  // Coalesce realtime bursts: a single booking change can fire several
  // postgres_changes events; debounce so we refetch the (now date-bounded)
  // list once instead of once per event.
  const refetchBookingsRef = useRef(refetchBookings);
  refetchBookingsRef.current = refetchBookings;
  const refetchHotelsRef = useRef(refetchHotels);
  refetchHotelsRef.current = refetchHotels;

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

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleBookingsRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { refetchBookingsRef.current(); }, 500);
    };

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bookings' },
      scheduleBookingsRefetch,
    );

    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'hotels' },
      () => { refetchHotelsRef.current(); }
    );

    channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Resolve the accepted therapists' display names for duo bookings. booking_therapists
  // has no FK to therapists, so this can't be an embedded join — resolve it here from the
  // already-fetched therapists list.
  const enrichedBookings = useMemo(() => {
    if (!bookings) return bookings;
    const nameById = new Map(
      (therapists ?? []).map((t) => [t.id, `${t.first_name} ${t.last_name ?? ""}`.trim()]),
    );
    return bookings.map((b) => {
      if ((b.guest_count ?? 1) <= 1) return b;
      const therapist_display_names = (b.booking_therapists ?? [])
        .filter((bt) => bt.status === "accepted")
        .map((bt) => nameById.get(bt.therapist_id))
        .filter((n): n is string => !!n);
      return { ...b, therapist_display_names };
    });
  }, [bookings, therapists]);

  const getHotelInfo = (hotelId: string | null): Hotel | null => {
    if (!hotelId || !hotels) return null;
    return hotels.find(h => h.id === hotelId) || null;
  };

  return {
    bookings: enrichedBookings,
    hotels,
    therapists,
    getHotelInfo,
    refetch: refetchBookings,
  };
}
