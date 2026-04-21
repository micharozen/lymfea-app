import type { OrgScope, TClient } from "./client.ts";

// Returns the list of hotel IDs belonging to the scope's organization.
// Null = no scoping (allOrganizations super-admin mode).
export async function resolveHotelIdsForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<string[] | null> {
  if ("allOrganizations" in scope && scope.allOrganizations) return null;
  const { data, error } = await client
    .from("hotels")
    .select("id")
    .eq("organization_id", (scope as { organizationId: string }).organizationId);
  if (error) throw error;
  return (data ?? []).map((h) => h.id);
}
