import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type HotelLedgerRow = Database["public"]["Tables"]["hotel_ledger"]["Row"];
type TherapistPayoutRow = Database["public"]["Tables"]["therapist_payouts"]["Row"];

export type HotelLedgerListItem = HotelLedgerRow & {
  hotels: { name: string; image: string | null } | null;
  bookings: {
    booking_id: string | null;
    client_first_name: string | null;
    client_last_name: string | null;
  } | null;
};

export async function listLedgerForOrg(
  client: TClient,
  scope: OrgScope,
  options: { limit?: number } = {},
): Promise<HotelLedgerListItem[]> {
  const limit = options.limit ?? 100;
  let q = client
    .from("hotel_ledger")
    .select(
      "*, hotels(name, image), bookings(booking_id, client_first_name, client_last_name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if ("organizationId" in scope && scope.organizationId) {
    // hotel_ledger has organization_id directly (added by multitenancy migration).
    // Prefer filtering on that column — it's the authoritative scoping column for
    // ledger rows and may differ from the hotel's current org if hotels move.
    q = q.eq("organization_id", scope.organizationId);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as HotelLedgerListItem[];
}

export type TherapistPayoutListItem = TherapistPayoutRow & {
  therapists: {
    first_name: string;
    last_name: string;
    profile_image: string | null;
  } | null;
  bookings: { booking_id: string | null; hotel_name: string | null } | null;
};

export async function listTherapistPayoutsForOrg(
  client: TClient,
  scope: OrgScope,
  options: { limit?: number } = {},
): Promise<TherapistPayoutListItem[]> {
  const limit = options.limit ?? 100;
  const hotelIds = await resolveHotelIdsForOrg(client, scope);

  let q = client
    .from("therapist_payouts")
    .select(
      "*, therapists(first_name, last_name, profile_image), bookings!inner(booking_id, hotel_name, hotel_id)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if ("organizationId" in scope && scope.organizationId) {
    // therapist_payouts has organization_id (nullable). Prefer filter on that
    // for rows created after multitenancy; fall back via inner join on bookings
    // for legacy rows with null organization_id.
    q = q.eq("organization_id", scope.organizationId);
  }

  const { data, error } = await q;
  if (error) throw error;

  // Legacy rows may have organization_id=null — filter them by booking.hotel_id
  // client-side to avoid missing records when the migration hasn't backfilled.
  if (hotelIds !== null) {
    return (data ?? []).filter((row) => {
      const booking = (row as TherapistPayoutListItem & { bookings?: { hotel_id?: string } })
        .bookings;
      if (!booking) return false;
      const hotelId = (booking as { hotel_id?: string }).hotel_id;
      return hotelId ? hotelIds.includes(hotelId) : true;
    }) as TherapistPayoutListItem[];
  }
  return (data ?? []) as TherapistPayoutListItem[];
}
