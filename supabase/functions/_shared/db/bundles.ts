import type { OrgScope, TClient } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

// Note: treatment_bundles / customer_treatment_bundles types may not be in
// the generated Database types yet (recent migration). Returning loosely-typed
// arrays here until types are regenerated.

export type TreatmentBundleListItem = {
  id: string;
  hotel_id: string;
  name: string;
  total_sessions: number;
  price: number;
  currency: string;
  status: string;
  [key: string]: unknown;
};

type GenericBuilder = {
  select: (s: string) => GenericBuilder;
  order: (c: string, o: { ascending: boolean }) => GenericBuilder;
  eq: (c: string, v: unknown) => GenericBuilder;
  in: (c: string, v: unknown[]) => GenericBuilder;
  then: Promise<{ data: unknown; error: unknown }>["then"];
};

function untypedFrom(client: TClient, table: string): GenericBuilder {
  return (client as unknown as { from: (t: string) => GenericBuilder }).from(table);
}

export async function listTreatmentBundlesForOrg(
  client: TClient,
  scope: OrgScope,
  options: { status?: string } = {},
): Promise<TreatmentBundleListItem[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  if (hotelIds !== null && hotelIds.length === 0) return [];

  let q: GenericBuilder = untypedFrom(client, "treatment_bundles")
    .select("*")
    .order("created_at", { ascending: false });

  if (hotelIds !== null) q = q.in("hotel_id", hotelIds);
  if (options.status) q = q.eq("status", options.status);

  const { data, error } = (await (q as unknown as Promise<{
    data: TreatmentBundleListItem[] | null;
    error: unknown;
  }>)) as { data: TreatmentBundleListItem[] | null; error: unknown };
  if (error) throw error as Error;
  return data ?? [];
}

export type CustomerTreatmentBundleListItem = {
  id: string;
  bundle_id: string;
  customer_id: string;
  hotel_id: string;
  total_sessions: number;
  used_sessions: number;
  status: string;
  [key: string]: unknown;
};

export async function listCustomerTreatmentBundlesForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<CustomerTreatmentBundleListItem[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  if (hotelIds !== null && hotelIds.length === 0) return [];

  let q: GenericBuilder = untypedFrom(client, "customer_treatment_bundles")
    .select(
      "*, customers(first_name, last_name, phone, email), treatment_bundles(name)",
    )
    .order("created_at", { ascending: false });

  if (hotelIds !== null) q = q.in("hotel_id", hotelIds);

  const { data, error } = (await (q as unknown as Promise<{
    data: CustomerTreatmentBundleListItem[] | null;
    error: unknown;
  }>)) as { data: CustomerTreatmentBundleListItem[] | null; error: unknown };
  if (error) throw error as Error;
  return data ?? [];
}

export async function getTreatmentBundleItemCounts(
  client: TClient,
  bundleIds: string[],
): Promise<Record<string, number>> {
  if (bundleIds.length === 0) return {};
  const q = untypedFrom(client, "treatment_bundle_items")
    .select("bundle_id")
    .in("bundle_id", bundleIds);
  const { data, error } = (await (q as unknown as Promise<{
    data: Array<{ bundle_id: string }> | null;
    error: unknown;
  }>)) as { data: Array<{ bundle_id: string }> | null; error: unknown };
  if (error) throw error as Error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.bundle_id] = (counts[row.bundle_id] ?? 0) + 1;
  }
  return counts;
}
