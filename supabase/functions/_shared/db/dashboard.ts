import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type HotelRow = Database["public"]["Tables"]["hotels"]["Row"];

export type DashboardBooking = Pick<
  BookingRow,
  | "id"
  | "booking_date"
  | "booking_time"
  | "total_price"
  | "hotel_id"
  | "hotel_name"
  | "status"
  | "payment_status"
  | "therapist_id"
  | "therapist_name"
  | "room_id"
  | "duration"
>;

export type DashboardHotel = Pick<HotelRow, "id" | "name" | "currency">;

export type DashboardData = {
  bookings: DashboardBooking[];
  hotels: DashboardHotel[];
  treatmentRooms: Array<{ id: string; hotel_id: string | null }>;
  todayAvailableTherapistIds: string[];
  therapistVenues: Array<{ therapist_id: string; hotel_id: string }>;
};

export async function getDashboardDataForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<DashboardData> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  if (hotelIds !== null && hotelIds.length === 0) {
    return {
      bookings: [],
      hotels: [],
      treatmentRooms: [],
      todayAvailableTherapistIds: [],
      therapistVenues: [],
    };
  }

  const today = new Date().toISOString().split("T")[0];

  let bookingsQ = client
    .from("bookings")
    .select(
      "id, booking_date, booking_time, total_price, hotel_id, hotel_name, status, payment_status, therapist_id, therapist_name, room_id, duration",
    )
    .order("booking_date", { ascending: true });
  let hotelsQ = client.from("hotels").select("id, name, currency").order("created_at", {
    ascending: false,
  });
  let roomsQ = client
    .from("treatment_rooms")
    .select("id, hotel_id")
    .in("status", ["active", "Actif"]);
  let venuesQ = client.from("therapist_venues").select("therapist_id, hotel_id");

  if (hotelIds !== null) {
    bookingsQ = bookingsQ.in("hotel_id", hotelIds);
    hotelsQ = hotelsQ.in("id", hotelIds);
    roomsQ = roomsQ.in("hotel_id", hotelIds);
    venuesQ = venuesQ.in("hotel_id", hotelIds);
  }

  const availabilityQ = client
    .from("therapist_availability")
    .select("therapist_id")
    .eq("date", today)
    .eq("is_available", true);

  const [bookingsRes, hotelsRes, roomsRes, venuesRes, availabilityRes] = await Promise.all([
    bookingsQ,
    hotelsQ,
    roomsQ,
    venuesQ,
    availabilityQ,
  ]);

  if (bookingsRes.error) throw bookingsRes.error;
  if (hotelsRes.error) throw hotelsRes.error;
  if (roomsRes.error) throw roomsRes.error;
  if (venuesRes.error) throw venuesRes.error;
  if (availabilityRes.error) throw availabilityRes.error;

  const venues = (venuesRes.data ?? []) as Array<{
    therapist_id: string;
    hotel_id: string;
  }>;

  // If scoped, restrict the "available therapists today" to those assigned to
  // venues in scoped hotels (defense in depth — therapist_availability has no
  // hotel column).
  let availableIds = ((availabilityRes.data ?? []) as Array<{ therapist_id: string }>).map(
    (r) => r.therapist_id,
  );
  if (hotelIds !== null) {
    const scopedTherapistIds = new Set(venues.map((v) => v.therapist_id));
    availableIds = availableIds.filter((id) => scopedTherapistIds.has(id));
  }

  return {
    bookings: (bookingsRes.data ?? []) as DashboardBooking[],
    hotels: (hotelsRes.data ?? []) as DashboardHotel[],
    treatmentRooms: (roomsRes.data ?? []) as Array<{ id: string; hotel_id: string | null }>,
    todayAvailableTherapistIds: availableIds,
    therapistVenues: venues,
  };
}
