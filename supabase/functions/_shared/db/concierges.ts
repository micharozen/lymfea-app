import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type ConciergeRow = Database["public"]["Tables"]["concierges"]["Row"];

export type ConciergeWithHotels = ConciergeRow & {
  hotels: Array<{ hotel_id: string }>;
};

export async function listConciergesForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<ConciergeWithHotels[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);

  // Two paths: a concierge might be linked via `concierges.hotel_id` (single-hotel)
  // or via `concierge_hotels` (multi-venue). The list page treats both as the same
  // entity and relies on the concierge_hotels array for display. We fetch with the
  // nested junction and filter outer rows by:
  //   - concierge.hotel_id IN hotelIds (legacy single-hotel link), OR
  //   - any concierge_hotels row matches hotelIds
  //
  // PostgREST doesn't support OR across direct column + nested relation in one
  // query, so for simplicity we use the junction (!inner) which covers both
  // current and future multi-venue setups.

  let q = client
    .from("concierges")
    .select("*, hotels:concierge_hotels!inner(hotel_id)")
    .order("created_at", { ascending: false });

  if (hotelIds !== null) {
    if (hotelIds.length === 0) return [];
    q = q.in("concierge_hotels.hotel_id", hotelIds);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ConciergeWithHotels[];
}

export async function getConciergeWithHotels(
  client: TClient,
  scope: OrgScope,
  conciergeId: string,
): Promise<ConciergeWithHotels | null> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  const { data, error } = await client
    .from("concierges")
    .select("*, hotels:concierge_hotels(hotel_id)")
    .eq("id", conciergeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Enforce org-scoping client-side: refuse to return a concierge whose venues
  // don't intersect with the caller's org hotels.
  if (hotelIds !== null) {
    const conciergeHotelIds = ((data as ConciergeWithHotels).hotels ?? []).map(
      (h) => h.hotel_id,
    );
    const intersects = conciergeHotelIds.some((id) => hotelIds.includes(id));
    if (!intersects) return null;
  }

  return data as ConciergeWithHotels;
}
