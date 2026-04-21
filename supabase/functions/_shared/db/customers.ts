import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export type CustomerWithPreferredTherapist = CustomerRow & {
  preferred_therapist: { id: string; first_name: string; last_name: string } | null;
};

// Customers are not directly linked to hotels/orgs in the schema. We scope the
// admin list to customers who have at least one booking in the org's hotels,
// which approximates "customers this org has interacted with". The query still
// respects scope.allOrganizations for super-admins in View All mode.
export async function listCustomersForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<CustomerWithPreferredTherapist[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);

  if (hotelIds === null) {
    const { data, error } = await client
      .from("customers")
      .select(
        "*, preferred_therapist:therapists!customers_preferred_therapist_id_fkey(id, first_name, last_name)",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CustomerWithPreferredTherapist[];
  }

  if (hotelIds.length === 0) return [];

  // Distinct customer phones from bookings in scoped hotels, then look up customers.
  const { data: bookingRows, error: bookingErr } = await client
    .from("bookings")
    .select("client_phone")
    .in("hotel_id", hotelIds);
  if (bookingErr) throw bookingErr;

  const phones = Array.from(
    new Set(
      (bookingRows ?? [])
        .map((b) => (b as { client_phone: string | null }).client_phone)
        .filter((p): p is string => !!p),
    ),
  );
  if (phones.length === 0) return [];

  const { data, error } = await client
    .from("customers")
    .select(
      "*, preferred_therapist:therapists!customers_preferred_therapist_id_fkey(id, first_name, last_name)",
    )
    .in("phone", phones)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerWithPreferredTherapist[];
}

export type CustomerSearchResult = Pick<
  CustomerRow,
  "id" | "first_name" | "last_name" | "phone" | "email"
>;

export async function searchCustomers(
  client: TClient,
  query: string,
): Promise<CustomerSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data, error } = await client
    .from("customers")
    .select("id, first_name, last_name, phone, email")
    .or(
      `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,email.ilike.%${trimmed}%`,
    )
    .limit(20);
  if (error) throw error;
  return (data ?? []) as CustomerSearchResult[];
}
