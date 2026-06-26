import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import type { BookingClientType } from "@/lib/clientTypeMeta";
import { derivePaymentForClientType } from "@/lib/clientTypePayment";
import { composePhoneNumber, languageFromCountryCode } from "@/lib/phone";

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
  /** Communication language for client SMS/emails. Defaults to the value
   *  derived from the country code (+33 → 'fr', otherwise 'en') when omitted. */
  language?: "fr" | "en";
  roomNumber: string;
  clientNote?: string;
  date: string;
  time: string;
  therapistId: string;
  /** Salle de soin choisie par l'admin. Si omis, assignation automatique
   *  (1ère salle libre au créneau). */
  roomId?: string;
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
  /** Réservation offerte (gratuite) : prix forcé à 0, payment "offert". */
  isOffert?: boolean;
  source?: string;
  emailInquiryId?: string;
  isBroadcast?: boolean;
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

      const clientType: BookingClientType = d.clientType ?? "external";
      const isOffert = d.isOffert ?? false;
      const { paymentMethod, paymentStatus } = derivePaymentForClientType(clientType, {
        payByVoucher: d.payByVoucher,
        isOffert,
      });

      const hasPhone = d.phone.trim().length > 0;
      const normalizedPhone = hasPhone
        ? composePhoneNumber(d.countryCode, d.phone).replace(/\s/g, "")
        : null;
      const language = d.language ?? languageFromCountryCode(d.countryCode);
      let customerId: string | null = null;
      if (hasPhone) {
        const { data } = await supabase.rpc("find_or_create_customer", {
          _phone: normalizedPhone!,
          _first_name: d.clientFirstName,
          _last_name: d.clientLastName,
          _email: d.clientEmail?.trim() || null,
          _language: language,
        });
        customerId = data ?? null;
      }

      const guestCount = d.guestCount ?? 1;
      const allTherapistIds = d.therapistIds?.length
        ? d.therapistIds
        : d.therapistId ? [d.therapistId] : [];
      const isBroadcast = d.isBroadcast ?? allTherapistIds.length === 0;

      let roomId: string | null = d.roomId?.trim() ? d.roomId.trim() : null;
      if (!roomId) {
        roomId = await pickFreeRoom(d.hotelId, d.date, d.time, new Set());
      }

      const { booking, status } = await insertSingleBooking(
        d,
        hotel,
        therapists,
        customerId,
        paymentMethod,
        paymentStatus,
        language,
        allTherapistIds,
        guestCount,
        isBroadcast,
        roomId,
      );

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

      if (!d.isAdmin && booking && isBroadcast) {
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
        const needsBroadcastNotify =
          isBroadcast || (guestCount > 1 && allTherapistIds.length < guestCount);

        await invokeEdgeFunction('trigger-new-booking-notifications', {
          body: {
            bookingId: booking.id,
            sendPaymentLink: false,
            ...(needsBroadcastNotify ? { notifyAll: true } : {}),
          },
        });
      } catch (notifyError) {
        console.error("Error triggering booking notifications:", notifyError);
        toast({
          title: "Notifications non envoyées",
          description: "La réservation a été créée mais les notifications ont pu échouer.",
          variant: "destructive",
        });
      }

      return booking;
    },
    onSuccess: (data, variables) => {
      const assigned = variables.therapistId || (variables.therapistIds?.length ?? 0) > 0;
      const message = variables.isAdmin
        ? "Réservation créée"
        : assigned && !variables.isBroadcast
          ? "Réservation confirmée"
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