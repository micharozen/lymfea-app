import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import { adminKeys } from "@shared/db";

export interface AssignableAdmin {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  profile_image: string | null;
}

// Admins that a task can be assigned to (and who will receive the in-app
// notification). Scoped to the active organization; only admins with a linked
// auth user are assignable.
export function useOrgAdmins() {
  const scope = useOrgScope();

  return useQuery({
    queryKey: adminKeys.list(scope),
    enabled: scope !== null,
    staleTime: 60_000,
    queryFn: async (): Promise<AssignableAdmin[]> => {
      let query = supabase
        .from("admins")
        .select("user_id, first_name, last_name, email, profile_image")
        .not("user_id", "is", null)
        .order("first_name", { ascending: true });

      if (scope && "organizationId" in scope && scope.organizationId) {
        query = query.eq("organization_id", scope.organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AssignableAdmin[];
    },
  });
}
