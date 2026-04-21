import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type TherapistRow = Database["public"]["Tables"]["therapists"]["Row"];

export type TherapistWithVenues = TherapistRow & {
  therapist_venues: Array<{ hotel_id: string }>;
};

export async function listTherapistsForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<TherapistWithVenues[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  let q = client
    .from("therapists")
    .select("*, therapist_venues!inner(hotel_id)")
    .order("created_at", { ascending: false });
  if (hotelIds !== null) {
    if (hotelIds.length === 0) return [];
    q = q.in("therapist_venues.hotel_id", hotelIds);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TherapistWithVenues[];
}

export type TherapistDropdownItem = Pick<
  TherapistRow,
  "id" | "first_name" | "last_name"
> & {
  status?: string | null;
};

// Active therapists available at a specific hotel — for booking flows.
export async function listActiveTherapistsForHotel(
  client: TClient,
  hotelId: string,
): Promise<TherapistDropdownItem[]> {
  const { data, error } = await client
    .from("therapist_venues")
    .select("therapists!inner(id, first_name, last_name, status)")
    .eq("hotel_id", hotelId)
    .in("therapists.status", ["active", "Actif", "Active"])
    .order("therapists(first_name)");
  if (error) throw error;
  type Row = { therapists: TherapistDropdownItem };
  return ((data ?? []) as unknown as Row[])
    .map((r) => r.therapists)
    .filter((t): t is TherapistDropdownItem => t !== null && t !== undefined);
}

// All active therapists across the scoped org, minimal shape for admin dropdowns.
export async function listActiveTherapistsForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<TherapistDropdownItem[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  if (hotelIds !== null && hotelIds.length === 0) return [];

  let q = client
    .from("therapists")
    .select("id, first_name, last_name, status, therapist_venues!inner(hotel_id)")
    .eq("status", "active")
    .order("first_name");
  if (hotelIds !== null) {
    q = q.in("therapist_venues.hotel_id", hotelIds);
  }
  const { data, error } = await q;
  if (error) throw error;
  // Dedup — a therapist at multiple venues returns once with multiple venue rows, but .select("id, ...") already returns once per therapist. Still safe:
  return (data ?? []).map(({ id, first_name, last_name, status }) => ({
    id,
    first_name,
    last_name,
    status,
  }));
}
