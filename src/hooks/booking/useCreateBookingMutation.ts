import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import type { BookingClientType } from "@/lib/clientTypeMeta";

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

export interface AmenityAccessPayload {
  venueAmenityId: string;
  duration: number;
  price: number;
}

export interface TreatmentPayload {
  treatmentId: string;
  variantId?: string;
}

export interface CreateBookingPayload {
  hotelId: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail?: string;
  phone: string;
  countryCode: string;
  roomNumber: string;
  clientNote?: string;
  date: string;
  time: string;
  therapistId: string;
  therapistIds?: string[];
  slot2Date: string | null;
  slot2Time: string | null;
  slot3Date: string | null;
  slot3Time: string | null;
  treatmentIds: string[];
  treatments?: TreatmentPayload[];
  totalPrice: number;
  totalDuration: number;
  isAdmin: boolean;
  isOutOfHours: boolean;
  surchargeAmount: number;
  amenityAccess?: AmenityAccessPayload[];
  guestCount?: number;
  clientType?: BookingClientType;
  payByVoucher?: boolean;
  voucherReference?: string | null;
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
      const guestCount = d.guestCount ?? 1;

      // Consolidation de tous les praticiens sélectionnés
      const allTherapistIds = d.therapistIds?.length
        ? d.therapistIds
        : d.therapistId ? [d.therapistId] : [];

      const primaryTherapist = allTherapistIds.length > 0 
        ? therapists?.find(h => h.id === allTherapistIds[0]) 
        : null;

      let status: string;
      let finalTherapistId = primaryTherapist ? primaryTherapist.id : null;
      let finalTherapistName = primaryTherapist ? `${primaryTherapist.first_name} ${primaryTherapist.last_name}` : null;

      // Logique de statut :
      // - confirmed : équipe complète
      // - awaiting_hairdresser_selection : équipe partielle (duo)
      // - pending : aucun thérapeute (broadcast)
      if (d.isAdmin) {
        if (allTherapistIds.length >= guestCount) {
          status = "confirmed";
        } else if (allTherapistIds.length === 0) {
          status = "pending";
        } else {
          status = "awaiting_hairdresser_selection";
        }
      } else {
        status = "pending";
        finalTherapistId = null;
        finalTherapistName = null;
      }

      const clientType: BookingClientType = d.clientType ?? "external";
      let paymentMethod: string | null = null;
      let paymentStatus: string | null = null;
      
      if (d.payByVoucher && (clientType === "hotel" || clientType === "external")) {
        paymentMethod = "voucher";
        paymentStatus = "paid";
      } else if (clientType === "hotel") {
        paymentMethod = "room";
        paymentStatus = "charged_to_room";
      } else if (clientType === "staycation" || clientType === "classpass") {
        paymentMethod = "partner_billed";
        paymentStatus = "pending_partner_billing";
      } else {
        paymentStatus = "pending";
      }

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

      const normalizedPhone = `${d.countryCode}${d.phone}`.replace(/\s/g, '');
      const { data: customerId } = await supabase.rpc('find_or_create_customer', {
        _phone: normalizedPhone,
        _first_name: d.clientFirstName,
        _last_name: d.clientLastName,
        _email: d.clientEmail?.trim() || null,
      });

      const { data: booking, error } = await supabase.from("bookings").insert({
        hotel_id: d.hotelId,
        hotel_name: hotel?.name || "",
        client_first_name: d.clientFirstName,
        client_last_name: d.clientLastName,
        client_email: d.clientEmail || null,
        phone: normalizedPhone,
        room_number: d.roomNumber,
        client_note: d.clientNote?.trim() ? d.clientNote.trim() : null,
        booking_date: d.date,
        booking_time: d.time,
        therapist_id: finalTherapistId,
        therapist_name: finalTherapistName,
        status,
        assigned_at: finalTherapistId ? new Date().toISOString() : null,
        total_price: d.totalPrice,
        is_out_of_hours: d.isOutOfHours,
        surcharge_amount: d.surchargeAmount,
        room_id: roomId,
        duration: d.totalDuration,
        customer_id: customerId || null,
        guest_count: guestCount,
        client_type: clientType,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        payment_reference: d.voucherReference || null,
      } as any).select().single();

      if (error) throw error;

      if (d.treatments && d.treatments.length > 0) {
        const { error: te } = await supabase.from("booking_treatments").insert(
          d.treatments.map((t) => ({
            booking_id: booking.id,
            treatment_id: t.treatmentId,
            variant_id: t.variantId || null,
          }))
        );
        if (te) throw te;
      } else if (d.treatmentIds.length) {
        const { error: te } = await supabase.from("booking_treatments").insert(
          d.treatmentIds.map((tid: string) => ({ booking_id: booking.id, treatment_id: tid }))
        );
        if (te) throw te;
      }

      // VRAIE CORRECTION : On s'assure que si l'insert échoue, on le voit !
      if (d.isAdmin && booking && allTherapistIds.length > 0) {
        const { error: btError } = await supabase.from("booking_therapists" as any).insert(
          allTherapistIds.map((tid: string) => ({
            booking_id: booking.id,
            therapist_id: tid,
            status: "accepted",
            assigned_at: new Date().toISOString(),
          }))
        );
        if (btError) {
          console.error("DB Error creating booking_therapists:", btError);
          throw new Error(`Erreur lors de l'assignation des praticiens: ${btError.message}`);
        }
      }

      if (d.amenityAccess && d.amenityAccess.length > 0 && booking) {
        for (const amenity of d.amenityAccess) {
          const [h, m] = d.time.split(":").map(Number);
          const endMinutes = h * 60 + m + amenity.duration;
          const endH = Math.floor(endMinutes / 60) % 24;
          const endM = endMinutes % 60;
          const endTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;

          await supabase.from("amenity_bookings").insert({
            hotel_id: d.hotelId,
            venue_amenity_id: amenity.venueAmenityId,
            booking_date: d.date,
            booking_time: d.time,
            duration: amenity.duration,
            end_time: endTime,
            customer_id: customerId || null,
            client_type: "lymfea",
            room_number: d.roomNumber || null,
            num_guests: 1,
            price: amenity.price,
            payment_status: amenity.price === 0 ? "offert" : "pending",
            status: "confirmed",
            linked_booking_id: booking.id,
          });
        }
      }

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
          if (guestCount > 1 && allTherapistIds.length < guestCount) {
            // Duo broadcast mode : le 2ème thérapeute n'est pas encore assigné,
            // on diffuse à tous les thérapeutes de l'hôtel comme en mode concierge.
            await invokeEdgeFunction('dispatch-booking-therapist', { body: { bookingId: booking.id } });
          } else {
            await invokeEdgeFunction('trigger-new-booking-notifications', { body: { bookingId: booking.id } });
          }
        } else {
          await invokeEdgeFunction('dispatch-booking-therapist', { body: { bookingId: booking.id } });
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
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });
}