import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AvailableRoom {
  id: string;
  name: string;
  room_number: string | null;
}

export interface AvailableRoomsResult {
  rooms: AvailableRoom[];
  occupiedRoomIds: Set<string>;
}

// Statuts pour lesquels une salle n'est plus considérée comme occupée.
const RELEASED_STATUSES = ["Annulé", "Terminé", "cancelled"];

/**
 * Liste les salles de soin actives d'un lieu et celles déjà occupées au créneau
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
        .select("id, name, room_number")
        .eq("hotel_id", hotelId!)
        .eq("status", "active")
        .order("name");
      if (roomsError) throw roomsError;

      let occupiedRoomIds = new Set<string>();
      if (date && time) {
        let q = supabase
          .from("bookings")
          .select("room_id")
          .eq("hotel_id", hotelId!)
          .eq("booking_date", date)
          .eq("booking_time", time)
          .not("room_id", "is", null)
          .not("status", "in", `(${RELEASED_STATUSES.map((s) => `"${s}"`).join(",")})`);
        if (excludeBookingId) q = q.neq("id", excludeBookingId);

        const { data: busy, error: busyError } = await q;
        if (busyError) throw busyError;
        occupiedRoomIds = new Set(
          (busy ?? []).map((b) => b.room_id).filter((id): id is string => !!id),
        );
      }

      return { rooms: rooms ?? [], occupiedRoomIds };
    },
  });

  return data ?? { rooms: [], occupiedRoomIds: new Set<string>() };
}
