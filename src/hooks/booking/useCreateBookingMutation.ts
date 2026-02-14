import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";

interface Hotel {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface Hairdresser {
  id: string;
  first_name: string;
  last_name: string;
  [key: string]: unknown;
}

export interface CreateBookingPayload {
  hotelId: string;
  clientFirstName: string;
  clientLastName: string;
  phone: string;
  countryCode: string;
  roomNumber: string;
  date: string;
  time: string;
  hairdresserId: string;
  slot2Date: string | null;
  slot2Time: string | null;
  slot3Date: string | null;
  slot3Time: string | null;
  treatmentIds: string[];
  totalPrice: number;
  totalDuration: number;
  isAdmin: boolean;
}

interface UseCreateBookingMutationOptions {
  hotels: Hotel[] | undefined;
  hairdressers: Hairdresser[] | undefined;
  onSuccess: (data: any) => void;
}

export function useCreateBookingMutation({ hotels, hairdressers, onSuccess }: UseCreateBookingMutationOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (d: CreateBookingPayload) => {
      const hotel = hotels?.find(h => h.id === d.hotelId);
      const hd = hairdressers?.find(h => h.id === d.hairdresserId);

      // Determine status and hairdresser based on role
      let status: string;
      let finalHairdresserId = d.hairdresserId || null;
      let finalHairdresserName = hd ? `${hd.first_name} ${hd.last_name}` : null;

      if (d.isAdmin) {
        // Admin: hairdresser is required, immediate confirmation
        status = "confirmed";
      } else {
        // Concierge: no hairdresser, awaiting hairdresser selection
        status = "awaiting_hairdresser_selection";
        finalHairdresserId = null;
        finalHairdresserName = null;
      }

      // Auto-assign trunk from hotel
      let trunkId: string | null = null;
      const { data: trunks } = await supabase
        .from("trunks")
        .select("id")
        .eq("hotel_id", d.hotelId)
        .eq("status", "active");

      if (trunks && trunks.length > 0) {
        const { data: bookingsWithTrunks } = await supabase
          .from("bookings")
          .select("trunk_id")
          .eq("hotel_id", d.hotelId)
          .eq("booking_date", d.date)
          .eq("booking_time", d.time)
          .not("trunk_id", "is", null)
          .not("status", "in", '("Annulé","Terminé","cancelled")');

        const usedTrunkIds = new Set(bookingsWithTrunks?.map(b => b.trunk_id) || []);

        for (const trunk of trunks) {
          if (!usedTrunkIds.has(trunk.id)) {
            trunkId = trunk.id;
            break;
          }
        }
      }

      const { data: booking, error } = await supabase.from("bookings").insert({
        hotel_id: d.hotelId,
        hotel_name: hotel?.name || "",
        client_first_name: d.clientFirstName,
        client_last_name: d.clientLastName,
        phone: `${d.countryCode} ${d.phone}`,
        room_number: d.roomNumber,
        booking_date: d.date,
        booking_time: d.time,
        hairdresser_id: finalHairdresserId,
        hairdresser_name: finalHairdresserName,
        status,
        assigned_at: finalHairdresserId ? new Date().toISOString() : null,
        total_price: d.totalPrice,
        trunk_id: trunkId,
        duration: d.totalDuration,
      }).select().single();

      if (error) throw error;

      if (d.treatmentIds.length) {
        const { error: te } = await supabase.from("booking_treatments").insert(
          d.treatmentIds.map((tid: string) => ({ booking_id: booking.id, treatment_id: tid }))
        );
        if (te) throw te;
      }

      // Concierge: create proposed slots record
      if (!d.isAdmin && booking) {
        const { error: slotError } = await supabase.from("booking_proposed_slots").insert({
          booking_id: booking.id,
          slot_1_date: d.date,
          slot_1_time: d.time,
          slot_2_date: d.slot2Date || null,
          slot_2_time: d.slot2Time || null,
          slot_3_date: d.slot3Date || null,
          slot_3_time: d.slot3Time || null,
        });
        if (slotError) console.error("Error creating proposed slots:", slotError);
      }

      try {
        if (d.isAdmin) {
          // Admin: notify the assigned hairdresser only
          await invokeEdgeFunction('trigger-new-booking-notifications', { body: { bookingId: booking.id } });
        } else {
          // Concierge: notify ALL hairdressers at this hotel
          await invokeEdgeFunction('trigger-new-booking-notifications', { body: { bookingId: booking.id, notifyAll: true } });
        }
      } catch {}

      return booking;
    },
    onSuccess: (data, variables) => {
      const message = variables.isAdmin
        ? "Réservation créée"
        : "Demande envoyée aux coiffeurs";
      toast({ title: message });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      onSuccess(data);
    },
    onError: () => {
      toast({ title: "Erreur", variant: "destructive" });
    },
  });
}
