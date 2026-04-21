// Query key factories for TanStack Query. Frontend-only consumer; Deno
// edge functions ignore this file. Keys are prefixed with the org scope so
// switching active organization invalidates the right slice of the cache.

type OrgKey = string | "__all__";

function orgKey(scope: { organizationId?: string; allOrganizations?: boolean }): OrgKey {
  return scope.allOrganizations ? "__all__" : (scope.organizationId ?? "__all__");
}

export const bookingKeys = {
  all: ["bookings"] as const,
  forOrg: (scope: { organizationId?: string; allOrganizations?: boolean }) =>
    [...bookingKeys.all, "org", orgKey(scope)] as const,
  list: (
    scope: { organizationId?: string; allOrganizations?: boolean },
    filters: Record<string, unknown>,
  ) => [...bookingKeys.forOrg(scope), "list", filters] as const,
  detail: (
    scope: { organizationId?: string; allOrganizations?: boolean },
    id: string,
  ) => [...bookingKeys.forOrg(scope), "detail", id] as const,
};
