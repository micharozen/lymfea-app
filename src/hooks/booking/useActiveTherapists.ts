import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Therapist {
  id: string;
  first_name: string;
  last_name: string;
}

/**
 * Shared active-therapists query. Same queryKey everywhere so the cache is
 * shared between the calendar/list and the detail page.
 */
export function useActiveTherapists() {
  return useQuery({
    queryKey: ["therapists"],
    staleTime: 5 * 60 * 1000,
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
}
