import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
import { useBookingsRealtime } from "./useBookingsRealtime";

export type Treatment = BookingTreatment;
export type { BookingTreatment };
export type BookingWithTreatments = BookingListItem;

export type { Hotel, Therapist };

/**
 * Resolve the accepted therapists' display names for duo bookings.
 * booking_therapists has no FK to therapists, so this can't be an embedded join
 * — it's resolved here from the already-fetched therapists list.
 */
export function withTherapistDisplayNames(
  bookings: BookingListItem[],
  therapists: Therapist[] | undefined,
): BookingListItem[] {
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
}

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
    isError,
  } = useQuery({
    queryKey: scope ? bookingKeys.list(scope, filters) : ["bookings", "disabled"],
    enabled: !!scope,
    staleTime: 30000,
    queryFn: () => listBookings(supabase, scope!, filters),
  });

  const { data: hotels, refetch: refetchHotels } = useCalendarHotels();
  const { data: therapists } = useActiveTherapists();

  useBookingsRealtime({
    channelName: "bookings-admin-realtime",
    onBookingsChange: refetchBookings,
    onHotelsChange: refetchHotels,
  });

  const enrichedBookings = useMemo(
    () => (bookings ? withTherapistDisplayNames(bookings, therapists) : bookings),
    [bookings, therapists],
  );

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
    isLoading,
    isError,
  };
}
