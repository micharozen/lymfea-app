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
  /** Salles pleines (occupation >= capacité) au créneau choisi. */
  occupiedRoomIds: Set<string>;
  /** Nombre de réservations occupant chaque salle au créneau choisi. */
  roomOccupancy: Map<string, number>;
}

// Statuts pour lesquels une salle n'est plus considérée comme occupée.
const RELEASED_STATUSES = ["Annulé", "Terminé", "cancelled"];

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
  excludeBookingId?: string,
): AvailableRoomsResult {
  const { data } = useQuery({
    queryKey: ["available-rooms", hotelId, date, time, excludeBookingId ?? null],
    enabled: !!hotelId,
    queryFn: async (): Promise<AvailableRoomsResult> => {
      const { data: rooms, error: roomsError } = await supabase
        .from("treatment_rooms")
        .select("id, name, room_number, capacity")
        .eq("hotel_id", hotelId!)
        .eq("status", "active")
        .order("name");
      if (roomsError) throw roomsError;

      const normalizedRooms: AvailableRoom[] = (rooms ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        room_number: r.room_number,
        capacity: r.capacity && r.capacity > 0 ? r.capacity : 1,
      }));

      const roomOccupancy = new Map<string, number>();
      if (date && time) {
        // Une salle est occupée si elle est utilisée comme salle principale (room_id)
        // OU comme salle secondaire (secondary_room_id) d'un booking Duo scindé.
        let q = supabase
          .from("bookings")
          .select("room_id, secondary_room_id")
          .eq("hotel_id", hotelId!)
          .eq("booking_date", date)
          .eq("booking_time", time)
          .not("status", "in", `(${RELEASED_STATUSES.map((s) => `"${s}"`).join(",")})`);
        if (excludeBookingId) q = q.neq("id", excludeBookingId);

        const { data: busy, error: busyError } = await q;
        if (busyError) throw busyError;
        for (const b of busy ?? []) {
          for (const id of [b.room_id, b.secondary_room_id]) {
            if (!id) continue;
            roomOccupancy.set(id, (roomOccupancy.get(id) ?? 0) + 1);
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
