import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useOrganizationSubscription } from "@/hooks/useOrganizationSubscription";

export interface SeatCapacity {
  used: number;
  seats: number;
  canAddVenue: boolean;
  loading: boolean;
}

export function useSeatCapacity(): SeatCapacity {
  const { organizationId, activeOrganizationId, isSuperAdmin, loading: userLoading } =
    useUser();
  const orgId = isSuperAdmin
    ? activeOrganizationId ?? organizationId
    : organizationId;
  const { data: sub, isLoading: subLoading } = useOrganizationSubscription();

  const hotelsQuery = useQuery<number>({
    enabled: Boolean(orgId) && !userLoading,
    queryKey: ["org-hotel-count", orgId],
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("hotels")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const used = hotelsQuery.data ?? 0;
  const seats = sub?.subscription?.seats ?? 0;
  const active = Boolean(sub?.hasActiveBilling);

  return {
    used,
    seats,
    canAddVenue: active && used < seats,
    loading: userLoading || subLoading || hotelsQuery.isLoading,
  };
}
