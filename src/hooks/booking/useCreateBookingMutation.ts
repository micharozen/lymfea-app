import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";

interface Hotel {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface Therapist {
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
  therapistId: string;
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
  therapists: Therapist[] | undefined;
  onSuccess: (data: any) => void;
}

export function useCreateBookingMutation({ hotels, therapists, onSuccess }: UseCreateBookingMutationOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (d: CreateBookingPayload) => {
      const hotel = hotels?.find(h => h.id === d.hotelId);
      const therapist = therapists?.find(h => h.id === d.therapistId);

      // Determine status and therapist based on role
      let status: string;
      let finalTherapistId = d.therapistId || null;
      let finalTherapistName = therapist ? `${therapist.first_name} ${therapist.last_name}` : null;

      if (d.isAdmin) {
        // Admin: therapist is required, immediate confirmation
        status = "confirmed";
      } else {
        // Concierge: no therapist, awaiting therapist selection
        status = "awaiting_hairdresser_selection";
        finalTherapistId = null;
        finalTherapistName = null;
      }

      // Auto-assign treatment room from hotel
      let roomId: string | null = null;
      const { data: treatmentRooms } = await supabase
        .from("treatment_rooms")
        .select("id")
        .eq("hotel_id", d.hotelId)
        .eq("status", "active");

      if (treatmentRooms && treatmentRooms.length > 0) {
        const { data: bookingsWithRooms } = await supabase
          .from("bookings")
          .select("room_id")
          .eq("hotel_id", d.hotelId)
          .eq("booking_date", d.date)
          .eq("booking_time", d.time)
          .not("room_id", "is", null)
          .not("status", "in", '("Annulé","Terminé","cancelled")');

        const usedRoomIds = new Set(bookingsWithRooms?.map(b => b.room_id) || []);

        for (const room of treatmentRooms) {
          if (!usedRoomIds.has(room.id)) {
            roomId = room.id;
            break;
          }
        }
      }

      // Find or create customer by phone
      const normalizedPhone = `${d.countryCode}${d.phone}`.replace(/\s/g, '');
      const { data: customerId } = await supabase.rpc('find_or_create_customer', {
        _phone: normalizedPhone,
        _first_name: d.clientFirstName,
        _last_name: d.clientLastName,
      });

      const { data: booking, error } = await supabase.from("bookings").insert({
        hotel_id: d.hotelId,
        hotel_name: hotel?.name || "",
        client_first_name: d.clientFirstName,
        client_last_name: d.clientLastName,
        phone: normalizedPhone,
        room_number: d.roomNumber,
        booking_date: d.date,
        booking_time: d.time,
        therapist_id: finalTherapistId,
        therapist_name: finalTherapistName,
        status,
        assigned_at: finalTherapistId ? new Date().toISOString() : null,
        total_price: d.totalPrice,
        room_id: roomId,
        duration: d.totalDuration,
        customer_id: customerId || null,
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
          // Admin: notify the assigned therapist only
          await invokeEdgeFunction('trigger-new-booking-notifications', { body: { bookingId: booking.id } });
        } else {
          // Concierge: notify ALL therapists at this venue
          await invokeEdgeFunction('trigger-new-booking-notifications', { body: { bookingId: booking.id, notifyAll: true } });
        }
      } catch {}

      return booking;
    },
    onSuccess: (data, variables) => {
      const message = variables.isAdmin
        ? "Réservation créée"
        : "Demande envoyée aux thérapeutes";
      toast({ title: message });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      onSuccess(data);
    },
    onError: () => {
      toast({ title: "Erreur", variant: "destructive" });
    },
  });
}
