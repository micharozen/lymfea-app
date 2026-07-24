import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VenueTreatmentMenu {
  id: string;
  name: string;
  name_en: string | null;
  duration: number | null;
  category: string;
}

/**
 * Prestations d'un lieu associables à un thérapeute.
 *
 * Exclut ce qu'un thérapeute ne peut pas « savoir faire » :
 *  - les add-ons, réalisés par le thérapeute du soin de base
 *  - les amenities (piscine, sauna...), qui n'ont pas de thérapeute
 */
export function useVenueTreatmentMenus(hotelId: string | null | undefined) {
  return useQuery({
    queryKey: ["venue-treatment-menus", hotelId],
    queryFn: async (): Promise<VenueTreatmentMenu[]> => {
      if (!hotelId) return [];
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("id, name, name_en, duration, category")
        .eq("hotel_id", hotelId)
        .eq("status", "active")
        .eq("is_addon", false)
        .is("amenity_id", null)
        .order("category")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!hotelId,
  });
}
