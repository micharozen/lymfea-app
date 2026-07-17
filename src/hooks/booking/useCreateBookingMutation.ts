import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import type { BookingClientType } from "@/lib/clientTypeMeta";
import { derivePaymentForClientType } from "@/lib/clientTypePayment";
import { composePhoneNumber, languageFromCountryCode } from "@/lib/phone";
import { therapistForTreatment } from "@/lib/therapistForTreatment";

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
  /** True for an add-on line (a supplement performed after a base soin). */
  isAddon?: boolean;
  /**
   * True for an amenity line (pool/sauna access). Needs no therapist: never gets a
   * therapist_id and never counts as a guest when spreading therapists over lines.
   */
  isAmenity?: boolean;
  /**
   * Which person (0-based) performs this line in a combo-duo. Base soins get
   * their own index; an add-on inherits the index of the base it hangs off.
   * Drives both the therapist assignment and the parent link at insert time.
   */
  legIndex?: number;
  /** For an add-on: the treatmentId of the base soin it extends. */
  parentTreatmentId?: string | null;
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
  /** Note persistante du client → customers.health_notes (écrite si customer résolu). */
  customerNote?: string;
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
  /**
   * Panier composé uniquement d'accès « amenity » (piscine, sauna…) : aucun praticien
   * requis, la réservation est confirmée d'emblée et n'est jamais diffusée.
   */
  amenityOnly?: boolean;
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

function isOverlappingSlot(
  slotTime: string,
  slotDuration: number,
  bookingTime: string,
  bookingDuration: number | null,
  turnoverMinutes: number,
): boolean {
  const [slotHour, slotMinute] = slotTime.split(":").map(Number);
  const slotStart = slotHour * 60 + slotMinute;
  const slotEnd = slotStart + slotDuration + turnoverMinutes;
  const [bookingHour, bookingMinute] = bookingTime.split(":").map(Number);
  const bookingStart = bookingHour * 60 + bookingMinute;
  const bookingEnd = bookingStart + (bookingDuration ?? 30) + turnoverMinutes;
  return slotStart < bookingEnd && slotEnd > bookingStart;
}

function isStaleAwaitingPayment(paymentStatus: string | null, createdAt: string | null): boolean {
  if (paymentStatus !== "awaiting_payment" || !createdAt) return false;
  return new Date(createdAt).getTime() < Date.now() - 10 * 60 * 1000;
}

async function pickFreeRoom(
  hotelId: string,
  date: string,
  time: string,
  durationMinutes: number,
  turnoverMinutes: number,
  excludeRoomIds: Set<string>,
): Promise<string | null> {
  const { data: treatmentRooms } = await supabase
    .from("treatment_rooms")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("status", "active")
    .order("id");

  if (!treatmentRooms?.length) return null;

  const { data: bookingsWithRooms } = await supabase
    .from("bookings")
    .select("room_id, secondary_room_id, booking_time, duration, payment_status, created_at")
    .eq("hotel_id", hotelId)
    .eq("booking_date", date)
    .not("status", "in", '("Annulé","Terminé","cancelled","completed","noshow")');

  const usedRoomIds = new Set([
    ...excludeRoomIds,
  ]);

  for (const booking of bookingsWithRooms ?? []) {
    if (isStaleAwaitingPayment(booking.payment_status, booking.created_at)) continue;
    if (!isOverlappingSlot(time, durationMinutes, booking.booking_time, booking.duration, turnoverMinutes)) continue;
    for (const id of [booking.room_id, booking.secondary_room_id]) {
      if (id) usedRoomIds.add(id);
    }
  }

  for (const room of treatmentRooms) {
    if (!usedRoomIds.has(room.id)) return room.id;
  }
  return null;
}

async function assertRoomsFree(
  hotelId: string,
  date: string,
  time: string,
  durationMinutes: number,
  turnoverMinutes: number,
  roomIds: string[],
) {
  const selectedRoomIds = roomIds.filter(Boolean);
  if (!selectedRoomIds.length) return;

  const { data: bookingsWithRooms, error } = await supabase
    .from("bookings")
    .select("room_id, secondary_room_id, booking_time, duration, payment_status, created_at")
    .eq("hotel_id", hotelId)
    .eq("booking_date", date)
    .not("status", "in", '("Annulé","Terminé","cancelled","completed","noshow")');
  if (error) throw error;

  for (const booking of bookingsWithRooms ?? []) {
    if (isStaleAwaitingPayment(booking.payment_status, booking.created_at)) continue;
    if (!isOverlappingSlot(time, durationMinutes, booking.booking_time, booking.duration, turnoverMinutes)) continue;

    if (
      selectedRoomIds.some((id) => id === booking.room_id || id === booking.secondary_room_id)
    ) {
      throw new Error("La salle sélectionnée est déjà réservée sur ce créneau.");
    }
  }
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
  const { status: resolvedStatus, therapistId: finalTherapistId, therapistName: finalTherapistName } =
    resolveAssignment(allTherapistIds, guestCount, therapists);
  // Un panier 100 % amenity n'attend aucun praticien : confirmé sans assignation.
  const status = d.amenityOnly ? "confirmed" : resolvedStatus;

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

  // Combo-duo lines carry a legIndex (the person performing them). Add-ons hang
  // off their person's base soin: insert bases first so each add-on can point at
  // the right base row, and give both the base and its add-ons that person's
  // therapist_id (positional therapistForTreatment would break — base + add-on
  // count ≠ guestCount).
  const isComboDuoLines = (d.treatments?.some((t) => t.legIndex !== undefined)) ?? false;

  if (d.treatments && d.treatments.length > 0 && isComboDuoLines) {
    const therapistForLeg = (legIndex?: number) =>
      legIndex !== undefined ? allTherapistIds[legIndex] ?? null : null;

    // Les lignes amenity n'appartiennent à aucune jambe : insérées à part, sans praticien.
    const baseLines = d.treatments.filter((t) => !t.isAddon && !t.isAmenity);
    const addonLines = d.treatments.filter((t) => t.isAddon && !t.isAmenity);
    const amenityLines = d.treatments.filter((t) => t.isAmenity);

    const { data: baseRows, error: baseErr } = await supabase.from("booking_treatments").insert(
      baseLines.map((t) => ({
        booking_id: booking.id,
        treatment_id: t.treatmentId,
        variant_id: t.variantId || null,
        price_override: t.priceOverride ?? null,
        therapist_id: therapistForLeg(t.legIndex),
      })),
    ).select("id, treatment_id");
    if (baseErr) throw baseErr;

    // The base row each add-on hangs off, keyed by the person (legIndex) — base
    // rows come back in insert order, so index i is person i.
    const baseRowByLeg = new Map<number, string>();
    (baseRows ?? []).forEach((row: { id: string }, i: number) => {
      const legIndex = baseLines[i]?.legIndex;
      if (legIndex !== undefined) baseRowByLeg.set(legIndex, row.id);
    });

    if (addonLines.length > 0) {
      const { error: addonErr } = await supabase.from("booking_treatments").insert(
        addonLines.map((t) => ({
          booking_id: booking.id,
          treatment_id: t.treatmentId,
          variant_id: t.variantId || null,
          price_override: t.priceOverride ?? null,
          therapist_id: therapistForLeg(t.legIndex),
          is_addon: true,
          parent_booking_treatment_id:
            t.legIndex !== undefined ? baseRowByLeg.get(t.legIndex) ?? null : null,
        })),
      );
      if (addonErr) throw addonErr;
    }

    if (amenityLines.length > 0) {
      const { error: amenityErr } = await supabase.from("booking_treatments").insert(
        amenityLines.map((t) => ({
          booking_id: booking.id,
          treatment_id: t.treatmentId,
          variant_id: t.variantId || null,
          price_override: t.priceOverride ?? null,
          therapist_id: null,
        })),
      );
      if (amenityErr) throw amenityErr;
    }
  } else if (d.treatments && d.treatments.length > 0) {
    // Un accès amenity n'est pas un invité : il sort du décompte et de la répartition
    // positionnelle, sinon il consommerait le praticien d'un vrai soin.
    const serviceLines = d.treatments.filter((t) => !t.isAmenity);
    const count = serviceLines.length;
    const serviceIndexOf = new Map(serviceLines.map((t, i) => [t, i]));
    const { error: te } = await supabase.from("booking_treatments").insert(
      d.treatments.map((t) => ({
        booking_id: booking.id,
        treatment_id: t.treatmentId,
        variant_id: t.variantId || null,
        price_override: t.priceOverride ?? null,
        therapist_id: t.isAmenity
          ? null
          : therapistForTreatment(serviceIndexOf.get(t)!, count, guestCount, allTherapistIds),
      })),
    );
    if (te) throw te;
  } else if (d.treatmentIds.length) {
    const count = d.treatmentIds.length;
    const { error: te } = await supabase.from("booking_treatments").insert(
      d.treatmentIds.map((tid: string, i: number) => ({
        booking_id: booking.id,
        treatment_id: tid,
        therapist_id: therapistForTreatment(i, count, guestCount, allTherapistIds),
      })),
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
      const turnoverValue = hotel?.["room_turnover_buffer_minutes"];
      const roomTurnoverBuffer = typeof turnoverValue === "number" ? turnoverValue : 0;

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

      // Note client persistante → customers.health_notes. On n'écrit que si un
      // client est résolu et que la note n'est pas vide (l'effacement se fait
      // depuis la fiche client, pas depuis le formulaire de réservation).
      if (customerId && d.customerNote?.trim()) {
        await supabase
          .from("customers")
          .update({ health_notes: d.customerNote.trim() })
          .eq("id", customerId);
      }

      const guestCount = d.guestCount ?? 1;
      const allTherapistIds = d.therapistIds?.length
        ? d.therapistIds
        : d.therapistId ? [d.therapistId] : [];
      const isBroadcast = d.amenityOnly ? false : (d.isBroadcast ?? allTherapistIds.length === 0);

      let roomId: string | null = d.roomId?.trim() ? d.roomId.trim() : null;
      if (!roomId) {
        roomId = await pickFreeRoom(
          d.hotelId,
          d.date,
          d.time,
          d.totalDuration || 30,
          roomTurnoverBuffer,
          new Set(),
        );
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
            d.totalDuration || 30,
            roomTurnoverBuffer,
            new Set([roomId]),
          );
        }
      }

      await assertRoomsFree(
        d.hotelId,
        d.date,
        d.time,
        d.totalDuration || 30,
        roomTurnoverBuffer,
        [roomId, secondaryRoomId].filter((id): id is string => !!id),
      );

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
      const message = variables.isAdmin || variables.amenityOnly
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
