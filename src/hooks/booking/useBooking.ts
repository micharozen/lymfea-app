import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import {
  bookingKeys,
  getBookingById,
  type BookingListItem,
} from "@shared/db";

/**
 * Fetch a single booking by id for the detail page. Replaces the previous
 * pattern of loading the whole org's booking list to `.find()` one row.
 *
 * When navigating from the list/planning, the booking is already in the list
 * cache — we seed it as `initialData` for an instant render, and only hit the
 * network in the cold-cache cases (global search, direct URL, new tab).
 */
export function useBooking(id: string | undefined) {
  const queryClient = useQueryClient();
  const scope = useOrgScope();

  // Seed from any cached bookings list for this scope (list or windowed planning).
  const seedFromListCache = (): BookingListItem | undefined => {
    if (!id || !scope) return undefined;
    const lists = queryClient.getQueriesData<BookingListItem[]>({
      queryKey: bookingKeys.forOrg(scope),
    });
    for (const [, data] of lists) {
      const found = data?.find((b) => b.id === id);
      if (found) return found;
    }
    return undefined;
  };

  return useQuery({
    queryKey: scope ? bookingKeys.detail(scope, id ?? "") : ["bookings", "detail", "disabled"],
    enabled: !!id && !!scope,
    staleTime: 30000,
    initialData: seedFromListCache,
    queryFn: () => getBookingById(supabase, id!),
  });
}
