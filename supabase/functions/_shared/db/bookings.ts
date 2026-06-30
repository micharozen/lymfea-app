import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveTreatmentPrice } from "../treatmentPrice.ts";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export type BookingTreatment = {
  id?: string;
  treatment_id?: string;
  name: string;
  duration: number | null;
  price: number | null;
  // Combo-duo: therapist performing this specific leg (NULL = booking owner / all).
  therapist_id?: string | null;
};

export type BookingListItem = BookingRow & {
  totalDuration: number;
  treatmentsTotalDuration: number;
  treatmentsTotalPrice: number;
  treatments: BookingTreatment[];
  room_name: string | null;
  // Name of the optional secondary room of a split duo booking (NULL = single room).
  secondary_room_name: string | null;
  // Full display names of all accepted therapists for a duo booking (incl. primary).
  // Resolved client-side in useBookingData (booking_therapists has no FK to therapists).
  therapist_display_names?: string[];
  booking_therapists?: { status: string; therapist_id: string }[];
  booking_payment_infos?: { payment_status: string | null; stripe_payment_method_id: string | null } | null;
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
    variant_id: string | null;
    price_override: number | null;
    therapist_id: string | null;
    treatment_menus: {
      name: string | null;
      duration: number | null;
      price: number | null;
    } | null;
    treatment_variants: {
      id: string;
      label: string | null;
      duration: number | null;
      price: number | null;
    } | null;
  }> | null;
  booking_payment_infos?:
    | { payment_status: string | null; stripe_payment_method_id: string | null }
    | Array<{ payment_status: string | null; stripe_payment_method_id: string | null }>
    | null;
  treatment_rooms?: { name: string | null } | null;
  secondary_room?: { name: string | null } | null;
};

function computeBookingItem(row: RawBookingRow): BookingListItem {
  const treatmentsJoin = row.booking_treatments ?? [];

  const treatmentsTotalDuration = treatmentsJoin.reduce(
    (sum, t) => sum + (t.treatment_variants?.duration ?? t.treatment_menus?.duration ?? 0),
    0,
  );
  const treatmentsTotalPrice = treatmentsJoin.reduce(
    (sum, t) => sum + resolveTreatmentPrice(t),
    0,
  );
  const totalDuration =
    row.duration && row.duration > 0 ? row.duration : treatmentsTotalDuration;

  const treatments: BookingTreatment[] = treatmentsJoin
    .filter((t) => t.treatment_menus !== null)
    .map((t) => {
      const variant = t.treatment_variants ?? null;
      const variantSuffix = variant?.label ? ` · ${variant.label}` : "";
      return {
        id: t.treatment_id ?? undefined,
        treatment_id: t.treatment_id ?? undefined,
        name: (t.treatment_menus!.name ?? "") + variantSuffix,
        duration: variant?.duration ?? t.treatment_menus!.duration,
        price: resolveTreatmentPrice(t),
        therapist_id: t.therapist_id ?? null,
      };
    });

  const paymentInfos = Array.isArray(row.booking_payment_infos)
    ? row.booking_payment_infos[0] ?? null
    : row.booking_payment_infos ?? null;

  const {
    booking_treatments: _drop,
    booking_payment_infos: _pi,
    treatment_rooms: roomJoin,
    secondary_room: secondaryRoomJoin,
    ...booking
  } = row;
  return {
    ...(booking as BookingRow),
    totalDuration,
    treatmentsTotalDuration,
    treatmentsTotalPrice,
    treatments,
    room_name: roomJoin?.name ?? null,
    secondary_room_name: secondaryRoomJoin?.name ?? null,
    booking_payment_infos: paymentInfos,
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
        variant_id,
        price_override,
        therapist_id,
        treatment_menus(name, duration, price),
        treatment_variants(id, label, duration, price)
      ),
      booking_therapists(status, therapist_id),
      booking_payment_infos(payment_status, stripe_payment_method_id),
      treatment_rooms!room_id(name),
      secondary_room:treatment_rooms!secondary_room_id(name),
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
