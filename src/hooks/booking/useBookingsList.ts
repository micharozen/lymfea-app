import { useCallback, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import {
  bookingKeys,
  listAllBookings,
  listBookingsPage,
  type BookingListFilters,
  type BookingListItem,
  type BookingListSort,
} from "@shared/db";
import { useCalendarHotels, type Hotel } from "./useCalendarHotels";
import { useActiveTherapists, type Therapist } from "./useActiveTherapists";
import { useBookingsRealtime } from "./useBookingsRealtime";
import { withTherapistDisplayNames } from "./useBookingData";

/** Taille d'un lot. Assez grand pour remplir un écran, assez petit pour rester instantané. */
export const BOOKINGS_PAGE_SIZE = 50;

interface UseBookingsListOptions {
  filters: BookingListFilters;
  sort: BookingListSort;
}

/**
 * Liste des réservations par lots successifs, filtrée et triée par Postgres.
 *
 * Le filtrage doit rester côté serveur : appliqué au navigateur, il ne verrait
 * que les lots déjà chargés, donnerait un total faux et masquerait des lignes
 * sans le dire.
 */
export function useBookingsList({ filters, sort }: UseBookingsListOptions) {
  const scope = useOrgScope();

  const { data: hotels, refetch: refetchHotels } = useCalendarHotels();
  const { data: therapists } = useActiveTherapists();

  const query = useInfiniteQuery({
    queryKey: scope
      ? bookingKeys.paged(scope, { ...filters, sortKey: sort.key, sortDirection: sort.direction })
      : ["bookings", "paged", "disabled"],
    enabled: !!scope,
    staleTime: 30000,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listBookingsPage(supabase, scope!, filters, {
        offset: pageParam as number,
        limit: BOOKINGS_PAGE_SIZE,
        sort,
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const bookings = useMemo(() => {
    const items = query.data?.pages.flatMap((p) => p.items) ?? [];
    return withTherapistDisplayNames(items, therapists);
  }, [query.data, therapists]);

  const total = query.data?.pages[0]?.total ?? 0;

  useBookingsRealtime({
    channelName: "bookings-list-realtime",
    onBookingsChange: query.refetch,
    onHotelsChange: refetchHotels,
  });

  const getHotelInfo = useCallback(
    (hotelId: string | null): Hotel | null =>
      (hotelId && hotels?.find((h) => h.id === hotelId)) || null,
    [hotels],
  );

  /**
   * Toutes les lignes correspondant aux filtres, au-delà de ce qui est affiché.
   * Réservé à l'export : une liste chargée par lots n'a pas de raison d'être
   * exportée tronquée.
   */
  const fetchAllMatching = useCallback(
    async (): Promise<BookingListItem[]> => {
      if (!scope) return [];
      const items = await listAllBookings(supabase, scope, filters, sort);
      return withTherapistDisplayNames(items, therapists);
    },
    [scope, filters, sort, therapists],
  );

  return {
    bookings,
    total,
    hotels,
    therapists,
    getHotelInfo,
    fetchAllMatching,
    isLoading: query.isLoading,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: query.fetchNextPage,
    refetch: query.refetch,
  };
}
