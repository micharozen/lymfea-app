import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TherapistLite {
  id: string;
  first_name: string;
  last_name: string | null;
  profile_image: string | null;
}

/** Un thérapeute actif rattaché à un lieu. Un même thérapeute peut apparaître sur plusieurs lieux. */
export interface VenueTherapistLink {
  hotelId: string;
  therapist: TherapistLite;
}

const ACTIVE_STATUSES = ["active", "actif"];

/** PostgREST plafonne une réponse à 1000 lignes ; sur plusieurs lieux on dépasse vite. */
const PAGE_SIZE = 1000;

export function compareTherapists(a: TherapistLite, b: TherapistLite): number {
  return a.first_name.localeCompare(b.first_name);
}

/**
 * Thérapeutes actifs rattachés aux lieux donnés (`therapist_venues`).
 *
 * Le filtre sur `therapists.status` est la référence commune du planning : un
 * thérapeute inactif ne compte ni comme colonne, ni comme ressource qualifiée.
 * Une troncature silencieuse retirerait des thérapeutes du calcul, donc on
 * pagine plutôt que de se fier au plafond PostgREST.
 */
export function useVenueTherapists(hotelIds: string[] | null | undefined) {
  // La clé doit être stable quel que soit l'ordre de la liste reçue.
  const ids = [...(hotelIds ?? [])].sort();

  return useQuery({
    queryKey: ["venue-therapists", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<VenueTherapistLink[]> => {
      type Row = {
        hotel_id: string;
        therapists: (TherapistLite & { status: string }) | null;
      };

      const links: VenueTherapistLink[] = [];

      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("therapist_venues")
          .select(
            "hotel_id, therapists!inner(id, first_name, last_name, profile_image, status)",
          )
          .in("hotel_id", ids)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;

        for (const row of (data as unknown as Row[]) ?? []) {
          const therapist = row.therapists;
          if (!therapist) continue;
          if (!ACTIVE_STATUSES.includes((therapist.status || "").toLowerCase())) continue;
          const { status: _status, ...lite } = therapist;
          links.push({ hotelId: row.hotel_id, therapist: lite });
        }

        if (!data || data.length < PAGE_SIZE) break;
      }

      return links;
    },
  });
}

/** Thérapeutes distincts d'un lieu, triés par prénom. */
export function therapistsOfVenue(
  links: VenueTherapistLink[] | undefined,
  hotelId: string,
): TherapistLite[] {
  const byId = new Map<string, TherapistLite>();
  for (const link of links ?? []) {
    if (link.hotelId === hotelId) byId.set(link.therapist.id, link.therapist);
  }
  return [...byId.values()].sort(compareTherapists);
}
