import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AvailableRoom {
  id: string;
  name: string;
  room_number: string | null;
  /** Nombre de lits / capacité simultanée de la salle (défaut 1). */
  capacity: number;
}

export interface AvailableRoomsResult {
  rooms: AvailableRoom[];
  /** Salles indisponibles au créneau choisi. */
  occupiedRoomIds: Set<string>;
  /** Occupation affichée par salle au créneau choisi. Une salle occupée vaut sa capacité. */
  roomOccupancy: Map<string, number>;
}

// Statuts pour lesquels une salle n'est plus considérée comme occupée.
const RELEASED_STATUSES = ["Annulé", "Terminé", "cancelled", "completed", "noshow"];

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function overlapsSlot(
  slotTime: string,
  slotDuration: number,
  bookingTime: string,
  bookingDuration: number | null,
  turnoverMinutes: number,
): boolean {
  const slotStart = timeToMinutes(slotTime);
  const slotEnd = slotStart + slotDuration + turnoverMinutes;
  const bookingStart = timeToMinutes(bookingTime);
  const bookingEnd = bookingStart + (bookingDuration ?? 30) + turnoverMinutes;
  return slotStart < bookingEnd && slotEnd > bookingStart;
}

function isStaleAwaitingPayment(paymentStatus: string | null, createdAt: string | null): boolean {
  if (paymentStatus !== "awaiting_payment" || !createdAt) return false;
  return new Date(createdAt).getTime() < Date.now() - 10 * 60 * 1000;
}

/**
 * Liste les salles de soin actives d'un lieu et leur occupation au créneau
 * choisi. Réutilise la logique d'auto-assignation de useCreateBookingMutation
 * pour proposer à l'admin une sélection cohérente avec la disponibilité réelle.
 *
 * @param excludeBookingId booking à exclure du calcul d'occupation (édition).
 */
export function useAvailableRooms(
  hotelId: string | undefined,
  date: string | undefined,
  time: string | undefined,
  durationMinutes = 30,
  excludeBookingId?: string,
): AvailableRoomsResult {
  const { data } = useQuery({
    queryKey: ["available-rooms", hotelId, date, time, durationMinutes, excludeBookingId ?? null],
    enabled: !!hotelId,
    queryFn: async (): Promise<AvailableRoomsResult> => {
      const { data: rooms, error: roomsError } = await supabase
        .from("treatment_rooms")
        .select("id, name, room_number, capacity")
        .eq("hotel_id", hotelId!)
        .eq("status", "active")
        .order("name");
      if (roomsError) throw roomsError;

      const { data: hotelSettings, error: hotelError } = await supabase
        .from("hotels")
        .select("room_turnover_buffer_minutes")
        .eq("id", hotelId!)
        .maybeSingle();
      if (hotelError) throw hotelError;
      const turnoverBuffer = hotelSettings?.room_turnover_buffer_minutes ?? 0;

      const normalizedRooms: AvailableRoom[] = (rooms ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        room_number: r.room_number,
        capacity: r.capacity && r.capacity > 0 ? r.capacity : 1,
      }));
      const capacityByRoom = new Map(normalizedRooms.map((r) => [r.id, r.capacity]));

      const roomOccupancy = new Map<string, number>();
      if (date && time) {
        // Une salle déjà utilisée par une réservation distincte n'est pas partageable,
        // même si sa capacité est > 1. Les lits multiples servent uniquement à un duo/trio
        // au sein d'une même réservation.
        let q = supabase
          .from("bookings")
          .select("room_id, secondary_room_id, booking_time, duration, payment_status, created_at")
          .eq("hotel_id", hotelId!)
          .eq("booking_date", date)
          .not("status", "in", `(${RELEASED_STATUSES.map((s) => `"${s}"`).join(",")})`);
        if (excludeBookingId) q = q.neq("id", excludeBookingId);

        const { data: busy, error: busyError } = await q;
        if (busyError) throw busyError;
        for (const b of busy ?? []) {
          if (isStaleAwaitingPayment(b.payment_status, b.created_at)) continue;
          if (!overlapsSlot(time, durationMinutes, b.booking_time, b.duration, turnoverBuffer)) continue;
          for (const id of [b.room_id, b.secondary_room_id]) {
            if (!id) continue;
            roomOccupancy.set(id, capacityByRoom.get(id) ?? 1);
          }
        }
      }

      const occupiedRoomIds = new Set<string>(
        normalizedRooms
          .filter((r) => (roomOccupancy.get(r.id) ?? 0) >= r.capacity)
          .map((r) => r.id),
      );

      return { rooms: normalizedRooms, occupiedRoomIds, roomOccupancy };
    },
  });

  return (
    data ?? {
      rooms: [],
      occupiedRoomIds: new Set<string>(),
      roomOccupancy: new Map<string, number>(),
    }
  );
}
