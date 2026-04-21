import type { OrgScope, TClient, Database } from "./client.ts";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export type BookingTreatment = {
  id?: string;
  treatment_id?: string;
  name: string;
  duration: number | null;
  price: number | null;
};

export type BookingListItem = BookingRow & {
  totalDuration: number;
  treatmentsTotalDuration: number;
  treatmentsTotalPrice: number;
  treatments: BookingTreatment[];
};

export type BookingListFilters = {
  hotelIds?: string[];
  fromDate?: string;
  toDate?: string;
  statuses?: string[];
};

type RawBookingRow = BookingRow & {
  booking_treatments?: Array<{
    treatment_id: string | null;
    treatment_menus: {
      name: string | null;
      duration: number | null;
      price: number | null;
    } | null;
  }> | null;
};

function computeBookingItem(row: RawBookingRow): BookingListItem {
  const treatmentsJoin = row.booking_treatments ?? [];

  const treatmentsTotalDuration = treatmentsJoin.reduce(
    (sum, t) => sum + (t.treatment_menus?.duration ?? 0),
    0,
  );
  const treatmentsTotalPrice = treatmentsJoin.reduce(
    (sum, t) => sum + (t.treatment_menus?.price ?? 0),
    0,
  );
  const totalDuration =
    row.duration && row.duration > 0 ? row.duration : treatmentsTotalDuration;

  const treatments: BookingTreatment[] = treatmentsJoin
    .filter((t) => t.treatment_menus !== null)
    .map((t) => ({
      id: t.treatment_id ?? undefined,
      treatment_id: t.treatment_id ?? undefined,
      name: t.treatment_menus!.name ?? "",
      duration: t.treatment_menus!.duration,
      price: t.treatment_menus!.price,
    }));

  const { booking_treatments: _drop, ...booking } = row;
  return {
    ...(booking as BookingRow),
    totalDuration,
    treatmentsTotalDuration,
    treatmentsTotalPrice,
    treatments,
  };
}

export async function listBookings(
  client: TClient,
  scope: OrgScope,
  filters: BookingListFilters = {},
): Promise<BookingListItem[]> {
  // Single query with nested select replaces the previous N+1 (one fetch per booking for treatments).
  let q = client
    .from("bookings")
    .select(
      `
      *,
      booking_treatments(
        treatment_id,
        treatment_menus(name, duration, price)
      ),
      hotels!inner(id, organization_id)
    `,
    )
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });

  if ("organizationId" in scope && scope.organizationId) {
    q = q.eq("hotels.organization_id", scope.organizationId);
  }
  if (filters.hotelIds?.length) q = q.in("hotel_id", filters.hotelIds);
  if (filters.fromDate) q = q.gte("booking_date", filters.fromDate);
  if (filters.toDate) q = q.lte("booking_date", filters.toDate);
  if (filters.statuses?.length) q = q.in("status", filters.statuses);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((row) => {
    // Strip the hotels join column — it was only added for the org filter.
    const { hotels: _hotels, ...rest } = row as RawBookingRow & { hotels?: unknown };
    return computeBookingItem(rest as RawBookingRow);
  });
}
