import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveTreatmentPrice } from "../treatmentPrice.ts";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export type BookingTreatment = {
  id?: string;
  /** booking_treatments row id — needed to target a specific line (e.g. set its therapist). */
  bookingTreatmentId?: string;
  treatment_id?: string;
  /** Stable soin↔therapist link. NULL/undefined = fall back to positional mapping. */
  therapist_id?: string | null;
  /** A supplement hanging off a base soin — never one of the guests' soins. */
  is_addon?: boolean;
  /** The booking_treatments row of the soin this add-on extends (its leg). */
  parent_booking_treatment_id?: string | null;
  /** true = accès à une commodité (amenity_id non null) : ni salle ni thérapeute. */
  is_amenity?: boolean;
  /** Type de la commodité liée (piscine, sauna…) — null si ce n'est pas un accès. */
  amenity_type?: string | null;
  /** Nom de la commodité liée — null si ce n'est pas un accès. */
  amenity_name?: string | null;
  name: string;
  duration: number | null;
  price: number | null;
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
  // Note persistante du client (customers.health_notes), remontée pour l'affichage
  // sur la fiche booking. NULL si pas de client lié ou pas de note.
  customer_health_notes: string | null;
};

export type BookingListFilters = {
  hotelIds?: string[];
  fromDate?: string;
  toDate?: string;
  statuses?: string[];
};

type RawBookingRow = BookingRow & {
  booking_treatments?: Array<{
    id: string;
    treatment_id: string | null;
    therapist_id: string | null;
    is_addon: boolean | null;
    parent_booking_treatment_id: string | null;
    variant_id: string | null;
    price_override: number | null;
    treatment_menus: {
      name: string | null;
      duration: number | null;
      price: number | null;
      amenity_id: string | null;
      venue_amenities: { type: string | null; name: string | null } | null;
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
  customers?: { health_notes: string | null } | null;
};

function computeBookingItem(row: RawBookingRow): BookingListItem {
  const treatmentsJoin = row.booking_treatments ?? [];

  // Amenity lines (pool/sauna access) occupy their own block, not the soin slot —
  // exclude them so the booking's soin duration is not inflated. Mirrors
  // computeSlotDuration server-side.
  const durationOf = (t: NonNullable<RawBookingRow["booking_treatments"]>[number]) =>
    t.treatment_variants?.duration ?? t.treatment_menus?.duration ?? 0;
  const soinLines = treatmentsJoin.filter((t) => t.treatment_menus?.amenity_id == null);

  // Solo: soins run sequentially → sum. Duo: one leg per guest running in
  // parallel → the longest leg wins (an add-on extends its parent's leg, an
  // orphan add-on stacks on top). Mirrors computeSlotDuration server-side so the
  // planning block matches the real occupied slot.
  let treatmentsTotalDuration: number;
  if ((row.guest_count ?? 1) <= 1) {
    treatmentsTotalDuration = soinLines.reduce((sum, t) => sum + durationOf(t), 0);
  } else {
    const legDurations = new Map<string, number>();
    for (const t of soinLines) {
      if (!t.is_addon) legDurations.set(t.id, durationOf(t));
    }
    let orphanDuration = 0;
    for (const t of soinLines) {
      if (!t.is_addon) continue;
      const parentId = t.parent_booking_treatment_id;
      if (parentId && legDurations.has(parentId)) {
        legDurations.set(parentId, legDurations.get(parentId)! + durationOf(t));
      } else {
        orphanDuration += durationOf(t);
      }
    }
    treatmentsTotalDuration = Math.max(0, ...legDurations.values()) + orphanDuration;
  }
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
        bookingTreatmentId: t.id,
        treatment_id: t.treatment_id ?? undefined,
        therapist_id: t.therapist_id ?? null,
        is_addon: t.is_addon ?? false,
        parent_booking_treatment_id: t.parent_booking_treatment_id ?? null,
        is_amenity: t.treatment_menus!.amenity_id != null,
        amenity_type: t.treatment_menus!.venue_amenities?.type ?? null,
        amenity_name: t.treatment_menus!.venue_amenities?.name ?? null,
        name: (t.treatment_menus!.name ?? "") + variantSuffix,
        duration: variant?.duration ?? t.treatment_menus!.duration,
        price: resolveTreatmentPrice(t),
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
    customers: customerJoin,
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
    customer_health_notes: customerJoin?.health_notes ?? null,
  };
}

// Nested select shared by listBookings and getBookingById. Kept in sync so a
// booking rendered from the list cache and one fetched by id have identical shape.
// NB: the org filter join (`hotels!inner(id, organization_id)`) is appended only
// by listBookings — getBookingById looks up by PK and relies on RLS for scoping.
const BOOKING_SELECT = `
      *,
      booking_treatments(
        id,
        treatment_id,
        therapist_id,
        is_addon,
        parent_booking_treatment_id,
        variant_id,
        price_override,
        treatment_menus(name, duration, price, amenity_id, venue_amenities(type, name)),
        treatment_variants(id, label, duration, price)
      ),
      booking_therapists(status, therapist_id),
      booking_payment_infos(payment_status, stripe_payment_method_id),
      treatment_rooms!room_id(name),
      secondary_room:treatment_rooms!secondary_room_id(name),
      customers(health_notes)`;

/**
 * Fetch a single booking by its primary key, with the same nested shape as
 * listBookings. No org filter: `id` is the PK and RLS already scopes access, so
 * this is the fastest possible lookup (used by the detail page instead of
 * loading the whole org's list to `.find()` one row).
 */
export async function getBookingById(
  client: TClient,
  id: string,
): Promise<BookingListItem | null> {
  const { data, error } = await client
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return computeBookingItem(data as RawBookingRow);
}

export async function listBookings(
  client: TClient,
  scope: OrgScope,
  filters: BookingListFilters = {},
): Promise<BookingListItem[]> {
  // Single query with nested select replaces the previous N+1 (one fetch per booking for treatments).
  // hotels!inner is appended here only to enable the org filter; it's stripped client-side below.
  let q = client
    .from("bookings")
    .select(`${BOOKING_SELECT},\n      hotels!inner(id, organization_id)`)
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
