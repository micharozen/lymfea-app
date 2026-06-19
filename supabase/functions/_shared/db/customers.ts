import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export type CustomerWithPreferredTherapist = CustomerRow & {
  preferred_therapist: { id: string; first_name: string; last_name: string } | null;
  booking_count: number;
};

// Builds a customer_id -> booking count map from booking rows.
function countBookingsByCustomer(
  rows: { customer_id: string | null }[] | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    if (!row.customer_id) continue;
    counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1);
  }
  return counts;
}

// Customers are not directly linked to hotels/orgs in the schema. We scope the
// admin list to customers who have at least one booking in the org's hotels
// (via bookings.customer_id), which approximates "customers this org has
// interacted with". The query still respects scope.allOrganizations for
// super-admins in View All mode.
export async function listCustomersForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<CustomerWithPreferredTherapist[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);

  if (hotelIds === null) {
    const [{ data, error }, { data: bookingRows, error: bookingErr }] =
      await Promise.all([
        client
          .from("customers")
          .select(
            "*, preferred_therapist:therapists!customers_preferred_therapist_id_fkey(id, first_name, last_name)",
          )
          .order("created_at", { ascending: false }),
        client.from("bookings").select("customer_id"),
      ]);
    if (error) throw error;
    if (bookingErr) throw bookingErr;
    const counts = countBookingsByCustomer(bookingRows);
    return (data ?? []).map((c) => ({
      ...c,
      booking_count: counts.get(c.id) ?? 0,
    })) as CustomerWithPreferredTherapist[];
  }

  if (hotelIds.length === 0) return [];

  // Distinct customer ids from bookings in scoped hotels, then look up customers.
  const { data: bookingRows, error: bookingErr } = await client
    .from("bookings")
    .select("customer_id")
    .in("hotel_id", hotelIds);
  if (bookingErr) throw bookingErr;

  const counts = countBookingsByCustomer(bookingRows);
  const customerIds = Array.from(counts.keys());
  if (customerIds.length === 0) return [];

  const { data, error } = await client
    .from("customers")
    .select(
      "*, preferred_therapist:therapists!customers_preferred_therapist_id_fkey(id, first_name, last_name)",
    )
    .in("id", customerIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...c,
    booking_count: counts.get(c.id) ?? 0,
  })) as CustomerWithPreferredTherapist[];
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
