import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lieux que l'utilisateur gère en tant que concierge, s'il l'est.
 *
 * Un thérapeute peut aussi être concierge d'un lieu : il peut alors basculer le
 * planning sur « tout le lieu ». Ce test était fait en trois requêtes
 * séquentielles au chargement de la page planning, pour *tous* les thérapeutes
 * alors que la quasi-totalité n'est pas concierge. Isolé ici, il ne s'exécute
 * que sur cette page, met en cache une heure, et court-circuite dès que
 * `user_roles` ne renvoie rien.
 */
async function fetchConciergeVenues(userId: string): Promise<string[]> {
  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "concierge")
    .maybeSingle();

  if (!role) return [];

  const { data: concierge } = await supabase
    .from("concierges")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!concierge) return [];

  const { data: venues } = await supabase
    .from("concierge_hotels")
    .select("hotel_id")
    .eq("concierge_id", concierge.id);

  return (venues ?? []).map((v) => v.hotel_id);
}

export function useConciergeVenues(userId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["pwa", "concierge-venues", userId],
    queryFn: () => fetchConciergeVenues(userId!),
    enabled: enabled && !!userId,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
  });
}
