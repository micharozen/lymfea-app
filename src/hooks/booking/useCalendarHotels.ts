import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Hotel {
  id: string;
  name: string;
  image: string | null;
  currency: string | null;
  calendar_color: string | null;
  opening_time: string | null;
  closing_time: string | null;
  room_turnover_buffer_minutes: number | null;
}

/**
 * Shared venues query for the booking calendar / list / detail. Same queryKey
 * everywhere so the cache is shared and the detail page never has to refetch it.
 */
export function useCalendarHotels() {
  return useQuery({
    queryKey: ["hotels", "booking-calendar"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select(
          "id, name, image, currency, calendar_color, opening_time, closing_time, room_turnover_buffer_minutes",
        )
        .order("name");
      if (error) throw error;
      return data as Hotel[];
    },
  });
}
