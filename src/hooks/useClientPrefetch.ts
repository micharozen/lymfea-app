import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Prefetch data for the next page in the client booking flow.
 * This hook runs on each route change and prefetches data
 * that the user is likely to need next.
 */
export function useClientPrefetch() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!hotelId) return;

    const currentPath = location.pathname;

    // Debounce prefetching to avoid overwhelming the server
    const timer = setTimeout(() => {
      prefetchForRoute(currentPath, hotelId, queryClient);
    }, 300);

    return () => clearTimeout(timer);
  }, [hotelId, location.pathname, queryClient]);
}

async function prefetchForRoute(
  currentPath: string,
  hotelId: string,
  queryClient: ReturnType<typeof useQueryClient>
) {
  // On Welcome page (now includes treatments) -> Prefetch venue hours for Schedule page
  if (currentPath === `/client/${hotelId}` || currentPath === `/client/${hotelId}/`) {
    queryClient.prefetchQuery({
      queryKey: ['venue-hours', hotelId],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_public_hotel_by_id', {
          _hotel_id: hotelId,
        });
        if (error) throw error;
        const hotel = data?.[0];
        return {
          openingHour: hotel?.opening_time
            ? parseInt(hotel.opening_time.split(':')[0], 10)
            : 6,
          closingHour: hotel?.closing_time
            ? parseInt(hotel.closing_time.split(':')[0], 10)
            : 23,
        };
      },
      staleTime: 30 * 60 * 1000,
    });
  }
}
