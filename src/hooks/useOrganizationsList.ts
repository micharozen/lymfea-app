import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ORGANIZATIONS_LIST_QUERY_KEY = ["organizations", "list"] as const;

export type OrganizationListItem = {
  id: string;
  name: string;
  logo_url: string | null;
};

export async function fetchOrganizationsList(): Promise<OrganizationListItem[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, logo_url")
    .order("name");

  if (error) throw error;
  return (data ?? []) as OrganizationListItem[];
}

export function useOrganizationsList(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery({
    queryKey: ORGANIZATIONS_LIST_QUERY_KEY,
    queryFn: fetchOrganizationsList,
    enabled,
    staleTime: 30_000,
  });
}

export function useInvalidateOrganizationsList() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_LIST_QUERY_KEY });
}
