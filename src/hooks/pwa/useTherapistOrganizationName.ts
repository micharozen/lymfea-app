import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brand } from "@/config/brand";

/**
 * Résout le nom de l'organisation d'un thérapeute pour le wordmark de l'app.
 * Le thérapeute n'a pas de lien direct vers `organizations` : on remonte via
 * ses lieux affiliés `therapist_venues → hotels.organization_id → organizations`.
 * Renvoie `commercial_name ?? name` de l'organisation principale, avec repli
 * sur `brand.name` (@/config/brand) tant que rien n'est résolu.
 */
async function fetchTherapistOrganizationName(therapistId: string): Promise<string> {
  const { data, error } = await supabase
    .from("therapist_venues")
    .select("hotels(organization_id, organizations(name, commercial_name))")
    .eq("therapist_id", therapistId);

  if (error) throw error;

  type OrgRow = { name: string | null; commercial_name: string | null } | null;
  type VenueRow = { hotels: { organization_id: string | null; organizations: OrgRow } | null };

  const rows = (data ?? []) as unknown as VenueRow[];
  const org = rows.map((r) => r.hotels?.organizations).find(Boolean) as OrgRow;

  return org?.commercial_name?.trim() || org?.name?.trim() || brand.name;
}

export function useTherapistOrganizationName(therapistId: string | null | undefined): string {
  const { data } = useQuery({
    queryKey: ["therapist-org", therapistId],
    queryFn: () => fetchTherapistOrganizationName(therapistId as string),
    enabled: !!therapistId,
    staleTime: 60 * 60 * 1000, // 1h — l'organisation change rarement
  });

  return data ?? brand.name;
}
