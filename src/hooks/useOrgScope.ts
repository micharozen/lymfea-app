import { useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import type { OrgScope } from "@shared/db";

// Resolves the current admin's effective organization scope from UserContext.
// Returns null if no scope can be determined yet (user not loaded, etc.).
export function useOrgScope(): OrgScope | null {
  const { isSuperAdmin, organizationId, activeOrganizationId, hasChosenActiveOrganization } =
    useUser();

  return useMemo<OrgScope | null>(() => {
    if (!isSuperAdmin) {
      return organizationId ? { organizationId } : null;
    }
    if (activeOrganizationId) return { organizationId: activeOrganizationId };
    if (hasChosenActiveOrganization) return { allOrganizations: true };
    return null;
  }, [isSuperAdmin, organizationId, activeOrganizationId, hasChosenActiveOrganization]);
}

// Stable string key derived from an OrgScope, useful as a TanStack cache key fragment.
export function orgScopeKey(scope: OrgScope | null): string {
  if (!scope) return "__pending__";
  if ("allOrganizations" in scope && scope.allOrganizations) return "__all__";
  return (scope as { organizationId: string }).organizationId;
}
