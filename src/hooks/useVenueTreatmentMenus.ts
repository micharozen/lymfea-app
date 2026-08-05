import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VenueTreatmentMenu {
  id: string;
  name: string;
  name_en: string | null;
  duration: number | null;
  category: string;
  hotel_id: string | null;
  /** Jours d'ouverture (0 = dimanche). `null` = proposée tous les jours. */
  available_days: number[] | null;
}

/** PostgREST plafonne une réponse à 1000 lignes ; sur plusieurs lieux on dépasse vite. */
const PAGE_SIZE = 1000;

const SELECT = "id, name, name_en, duration, category, hotel_id, available_days";

/**
 * Prestations associables à un thérapeute, pour un ou plusieurs lieux.
 *
 * Exclut ce qu'un thérapeute ne peut pas « savoir faire » :
 *  - les add-ons, réalisés par le thérapeute du soin de base
 *  - les amenities (piscine, sauna...), qui n'ont pas de thérapeute
 */
async function fetchTreatmentMenus(hotelIds: string[]): Promise<VenueTreatmentMenu[]> {
  const menus: VenueTreatmentMenu[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("treatment_menus")
      .select(SELECT)
      .in("hotel_id", hotelIds)
      .eq("status", "active")
      .eq("is_addon", false)
      .is("amenity_id", null)
      .order("category")
      .order("name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    menus.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return menus;
}

/** Prestations d'un lieu unique. */
export function useVenueTreatmentMenus(hotelId: string | null | undefined) {
  return useQuery({
    queryKey: ["venue-treatment-menus", hotelId],
    queryFn: () => fetchTreatmentMenus([hotelId!]),
    enabled: !!hotelId,
  });
}

/** Prestations de plusieurs lieux, pour les vues transverses (couverture). */
export function useVenuesTreatmentMenus(hotelIds: string[] | null | undefined) {
  // La clé doit être stable quel que soit l'ordre de la liste reçue.
  const ids = [...(hotelIds ?? [])].sort();

  return useQuery({
    queryKey: ["venues-treatment-menus", ids],
    queryFn: () => fetchTreatmentMenus(ids),
    enabled: ids.length > 0,
  });
}
