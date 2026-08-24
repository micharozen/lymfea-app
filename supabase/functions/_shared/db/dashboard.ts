import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type HotelRow = Database["public"]["Tables"]["hotels"]["Row"];

export type DashboardBooking = Pick<
  BookingRow,
  | "id"
  | "booking_id"
  | "booking_date"
  | "booking_time"
  | "created_at"
  | "total_price"
  | "hotel_id"
  | "hotel_name"
  | "status"
  | "payment_status"
  | "therapist_id"
  | "therapist_name"
  | "room_id"
  | "duration"
  | "client_type"
  | "room_number"
  | "guest_count"
  | "source"
>;

export type DashboardHotel = Pick<HotelRow, "id" | "name" | "currency" | "opening_time" | "closing_time">;

/** Fenêtre de dates (ISO YYYY-MM-DD) hors de laquelle le dashboard ne lit rien. */
export type DashboardWindow = { fromDate: string; toDate: string };

export type DashboardBookingWithTreatments = DashboardBooking & {
  booking_treatments: Array<{ treatment_menus: { name: string | null } | null }>;
};

export type DashboardData = {
  bookings: DashboardBookingWithTreatments[];
  hotels: DashboardHotel[];
  treatmentRooms: Array<{ id: string; hotel_id: string | null; name: string | null; capacity: number | null }>;
  todayAvailableTherapistIds: string[];
  therapistVenues: Array<{ therapist_id: string; hotel_id: string }>;
};

/** Plafond de lignes de PostgREST : une réponse plus longue est tronquée en silence. */
const POSTGREST_PAGE_SIZE = 1000;

export async function getDashboardDataForOrg(
  client: TClient,
  scope: OrgScope,
  window: DashboardWindow,
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

  // Les noms de prestations viennent d'une jointure imbriquée : une seconde
  // requête `booking_id=in.(<un uuid par réservation>)` produirait une URL de
  // plusieurs dizaines de Ko, rejetée par le proxy.
  const bookingsPage = (offset: number) => {
    const q = client
      .from("bookings")
      .select(
        "id, booking_id, booking_date, booking_time, created_at, total_price, hotel_id, hotel_name, status, payment_status, therapist_id, therapist_name, room_id, duration, client_type, room_number, guest_count, source, booking_treatments(treatment_menus(name))",
      )
      .gte("booking_date", window.fromDate)
      .lte("booking_date", window.toDate)
      .order("booking_date", { ascending: true })
      // Départage stable : sans ça, une même ligne peut apparaître dans deux lots.
      .order("id", { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);
    return hotelIds !== null ? q.in("hotel_id", hotelIds) : q;
  };

  let hotelsQ = client.from("hotels").select("id, name, currency, opening_time, closing_time").order("created_at", {
    ascending: false,
  });
  let roomsQ = client
    .from("treatment_rooms")
    .select("id, hotel_id, name, capacity")
    .in("status", ["active", "Actif"]);
  let venuesQ = client.from("therapist_venues").select("therapist_id, hotel_id");

  if (hotelIds !== null) {
    hotelsQ = hotelsQ.in("id", hotelIds);
    roomsQ = roomsQ.in("hotel_id", hotelIds);
    venuesQ = venuesQ.in("hotel_id", hotelIds);
  }

  const availabilityQ = client
    .from("therapist_availability")
    .select("therapist_id")
    .eq("date", today)
    .eq("is_available", true);

  // Les réservations sont lues par lots : au-delà du plafond PostgREST, une
  // page pleine ne signifie pas la fin des données, elle signifie qu'il en reste.
  const fetchAllBookings = async (): Promise<DashboardBookingWithTreatments[]> => {
    const rows: DashboardBookingWithTreatments[] = [];
    for (let offset = 0; ; offset += POSTGREST_PAGE_SIZE) {
      const { data, error } = await bookingsPage(offset);
      if (error) throw error;
      const batch = (data ?? []) as unknown as DashboardBookingWithTreatments[];
      rows.push(...batch);
      if (batch.length < POSTGREST_PAGE_SIZE) return rows;
    }
  };

  const [bookings, hotelsRes, roomsRes, venuesRes, availabilityRes] = await Promise.all([
    fetchAllBookings(),
    hotelsQ,
    roomsQ,
    venuesQ,
    availabilityQ,
  ]);

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
    bookings,
    hotels: (hotelsRes.data ?? []) as DashboardHotel[],
    treatmentRooms: (roomsRes.data ?? []) as Array<{
      id: string;
      hotel_id: string | null;
      name: string | null;
      capacity: number | null;
    }>,
    todayAvailableTherapistIds: availableIds,
    therapistVenues: venues,
  };
}
