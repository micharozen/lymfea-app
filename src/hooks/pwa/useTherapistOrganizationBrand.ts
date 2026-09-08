import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brand } from "@/config/brand";

/** Logo affiché tant que l'organisation n'en fournit pas un. */
export const ORG_LOGO_FALLBACK = "/images/saoma.png";

export interface OrganizationBrand {
  name: string;
  logoUrl: string;
}

/**
 * Résout la marque (nom + logo) de l'organisation d'un thérapeute pour l'en-tête
 * de l'app. Le thérapeute n'a pas de lien direct vers `organizations` : on remonte
 * via ses lieux affiliés `therapist_venues → hotels.organization_id → organizations`.
 * Le nom sert de texte alternatif au logo, avec repli sur `brand.name`
 * (@/config/brand) ; le logo se replie sur {@link ORG_LOGO_FALLBACK}.
 */
async function fetchTherapistOrganizationBrand(therapistId: string): Promise<OrganizationBrand> {
  const { data, error } = await supabase
    .from("therapist_venues")
    .select("hotels(organization_id, organizations(name, commercial_name, logo_url))")
    .eq("therapist_id", therapistId);

  if (error) throw error;

  type OrgRow = { name: string | null; commercial_name: string | null; logo_url: string | null } | null;
  type VenueRow = { hotels: { organization_id: string | null; organizations: OrgRow } | null };

  const rows = (data ?? []) as unknown as VenueRow[];
  const org = rows.map((r) => r.hotels?.organizations).find(Boolean) as OrgRow;

  return {
    name: org?.commercial_name?.trim() || org?.name?.trim() || brand.name,
    logoUrl: org?.logo_url?.trim() || ORG_LOGO_FALLBACK,
  };
}

const FALLBACK_BRAND: OrganizationBrand = { name: brand.name, logoUrl: ORG_LOGO_FALLBACK };

export function useTherapistOrganizationBrand(
  therapistId: string | null | undefined
): OrganizationBrand {
  const { data } = useQuery({
    queryKey: ["therapist-org", therapistId],
    queryFn: () => fetchTherapistOrganizationBrand(therapistId as string),
    enabled: !!therapistId,
    staleTime: 60 * 60 * 1000, // 1h — l'organisation change rarement
  });

  return data ?? FALLBACK_BRAND;
}
