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
  priceOverride?: number | null;
}

export interface CreateBookingPayload {
  hotelId: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail?: string;
  phone: string;
  countryCode: string;
  /** Civilité du client (optionnel) — stockée sur la fiche customer. */
  civility?: "madame" | "monsieur";
  language?: "fr" | "en";
  roomNumber: string;
  clientNote?: string;
  date: string;
  time: string;
  therapistId: string;
  roomId?: string;
  /**
   * Salle secondaire pour un Duo scindé sur 2 salles (admin uniquement).
   * undefined = salle unique. "" = auto-pick d'une 2e salle libre ≠ principale.
   */
  secondaryRoomId?: string;
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
  /** admin-combo-duo: N solo treatments booked as one duo booking */
  comboDuo?: boolean;
}

function resolveAssignment(
  allTherapistIds: string[],
  guestCount: number,
  therapists: Therapist[] | undefined,
) {
  const primaryTherapist = allTherapistIds.length > 0
    ? therapists?.find(h => h.id === allTherapistIds[0])
    : null;

  // 'confirmed' once every slot is staffed; otherwise 'pending' (a duo still
  // needing therapists is pending + guest_count > 1).
  const status: string = allTherapistIds.length >= guestCount ? "confirmed" : "pending";

  return {
    status,
    therapistId: primaryTherapist?.id ?? null,
    therapistName: primaryTherapist
      ? `${primaryTherapist.first_name} ${primaryTherapist.last_name}`
      : null,
  };
}

interface UseCreateBookingMutationOptions {
  hotels: Hotel[] | undefined;
  therapists: Therapist[] | undefined;
  onSuccess: (data: any) => void;
}

async function pickFreeRoom(
  hotelId: string,
  date: string,
  time: string,
  excludeRoomIds: Set<string>,
): Promise<string | null> {
  const { data: treatmentRooms } = await supabase
    .from("treatment_rooms")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("status", "active");

  if (!treatmentRooms?.length) return null;

  const { data: bookingsWithRooms } = await supabase
    .from("bookings")
    .select("room_id")
    .eq("hotel_id", hotelId)
    .eq("booking_date", date)
    .eq("booking_time", time)
    .not("room_id", "is", null)
    .not("status", "in", '("Annulé","Terminé","cancelled")');

  const usedRoomIds = new Set([
    ...(bookingsWithRooms?.map((b) => b.room_id) || []),
    ...excludeRoomIds,
  ]);

  for (const room of treatmentRooms) {
    if (!usedRoomIds.has(room.id)) return room.id;
  }
  return null;
}

async function insertSingleBooking(
  d: CreateBookingPayload,
  hotel: Hotel | undefined,
  therapists: Therapist[] | undefined,
  customerId: string | null,
  paymentMethod: string | null,
  paymentStatus: string | null,
  language: "fr" | "en",
  allTherapistIds: string[],
  guestCount: number,
  isBroadcast: boolean,
  roomId: string | null,
  secondaryRoomId: string | null,
) {
  const { status, therapistId: finalTherapistId, therapistName: finalTherapistName } =
    resolveAssignment(allTherapistIds, guestCount, therapists);

  const { data: booking, error } = await supabase.from("bookings").insert({
    hotel_id: d.hotelId,
    hotel_name: hotel?.name || "",
    client_first_name: d.clientFirstName,
    client_last_name: d.clientLastName,
    client_email: d.clientEmail || null,
    phone: d.phone.trim() ? composePhoneNumber(d.countryCode, d.phone).replace(/\s/g, "") : null,
    room_number: d.roomNumber?.trim() ? d.roomNumber.trim() : null,
    client_note: d.clientNote?.trim() ? d.clientNote.trim() : null,
    booking_date: d.date,
    booking_time: d.time,
    therapist_id: finalTherapistId,
    therapist_name: finalTherapistName,
    status,
    assigned_at: finalTherapistId ? new Date().toISOString() : null,
    total_price: d.isOffert ? 0 : d.totalPrice,
    is_out_of_hours: d.isOffert ? false : d.isOutOfHours,
    surcharge_amount: d.isOffert ? 0 : d.surchargeAmount,
    room_id: roomId,
    // Garde-fou : pas de salle secondaire identique à la principale.
    secondary_room_id: secondaryRoomId && secondaryRoomId !== roomId ? secondaryRoomId : null,
    duration: d.totalDuration,
    customer_id: customerId || null,
    guest_count: guestCount,
    client_type: d.clientType ?? "external",
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    payment_reference: d.voucherReference || null,
    source: d.source ?? "admin",
    email_inquiry_id: d.emailInquiryId ?? null,
    language,
    booking_group_id: null,
  } as any).select("id, booking_id, hotel_name, status").single();

  if (error) throw error;

  if (d.treatments && d.treatments.length > 0) {
    const { error: te } = await supabase.from("booking_treatments").insert(
      d.treatments.map((t) => ({
        booking_id: booking.id,
        treatment_id: t.treatmentId,
        variant_id: t.variantId || null,
        price_override: t.priceOverride ?? null,
      })),
    );
    if (te) throw te;
  } else if (d.treatmentIds.length) {
    const { error: te } = await supabase.from("booking_treatments").insert(
      d.treatmentIds.map((tid: string) => ({ booking_id: booking.id, treatment_id: tid })),
    );
    if (te) throw te;
  }

  if (booking && allTherapistIds.length > 0) {
    // Insert simple (pas d'upsert) : la réservation vient d'être créée, aucune ligne
    // booking_therapists ne peut préexister. On évite `ON CONFLICT DO NOTHING`, qui
    // exigerait une policy SELECT satisfaite côté thérapeute (RLS) — celle-ci dépend
    // de is_booking_participant, faux tant que la ligne n'existe pas → erreur 42501.
    // On dédoublonne les IDs en amont par sûreté (UNIQUE(booking_id, therapist_id)).
    const uniqueTherapistIds = Array.from(new Set(allTherapistIds));
    const { error: btError } = await supabase.from("booking_therapists" as any).insert(
      uniqueTherapistIds.map((tid: string) => ({
        booking_id: booking.id,
        therapist_id: tid,
        status: "accepted",
        assigned_at: new Date().toISOString(),
      })),
    );
    if (btError) throw new Error(`Erreur lors de l'assignation des praticiens: ${btError.message}`);
  }

  return { booking, status, isBroadcast, allTherapistIds, guestCount };
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
          _civility: d.civility ?? null,
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

      // Salle secondaire (Duo scindé) : undefined = non scindé. "" = auto-pick d'une
      // 2e salle libre différente de la principale. Sinon valeur choisie par l'admin.
      let secondaryRoomId: string | null = null;
      if (d.secondaryRoomId !== undefined) {
        secondaryRoomId = d.secondaryRoomId.trim() ? d.secondaryRoomId.trim() : null;
        if (!secondaryRoomId && roomId) {
          secondaryRoomId = await pickFreeRoom(
            d.hotelId,
            d.date,
            d.time,
            new Set([roomId]),
          );
        }
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
        secondaryRoomId,
      );

      if (d.amenityAccess && d.amenityAccess.length > 0 && booking) {
        const [h, m] = d.time.split(":").map(Number);
        for (const amenity of d.amenityAccess) {
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
        await invokeEdgeFunction("trigger-new-booking-notifications", {
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
