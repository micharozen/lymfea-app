import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BookingRoomOption {
  id: string;
  name: string;
  room_number: string;
  capacity: number;
  /** Chevauchement réel avec une autre réservation : la salle ne peut pas être choisie. */
  is_occupied: boolean;
  /** Conflit dû à la seule fenêtre de remise en état : avertissement non bloquant. */
  turnover_conflict: boolean;
}

/**
 * Salles de soin du lieu d'une réservation, avec leur occupation au créneau.
 *
 * Passe par le RPC `get_booking_room_options` (SECURITY DEFINER) : la table
 * `treatment_rooms` n'est pas lisible par le rôle thérapeute en RLS, donc ni la
 * liste ni le nom de la salle assignée ne sont accessibles en direct depuis la PWA.
 */
export function useBookingRoomOptions(bookingId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["pwa-booking-room-options", bookingId],
    enabled: !!bookingId && enabled,
    queryFn: async (): Promise<BookingRoomOption[]> => {
      const { data, error } = await supabase.rpc("get_booking_room_options", {
        _booking_id: bookingId!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
