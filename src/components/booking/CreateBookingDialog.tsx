import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUserContext } from "@/hooks/useUserContext";
import { useOrgScope } from "@/hooks/useOrgScope";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import {
  hotelKeys,
  therapistKeys,
  treatmentKeys,
  listHotelsForOrg,
  listActiveTherapistsForHotel,
  listActiveTherapistsForOrg,
  listActiveTreatmentsForHotel,
  listTreatmentMenusForOrg,
} from "@shared/db";
import { useBookingCart } from "@/hooks/booking/useBookingCart";
import { useCreateBookingMutation } from "@/hooks/booking/useCreateBookingMutation";
import { SendBookingNotificationDialog } from "@/components/booking/SendBookingNotificationDialog";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import { BookingWizardStepper } from "@/components/ui/BookingWizardStepper";
import { format } from "date-fns";
import { formatPrice } from "@/lib/formatPrice";
import { cn } from "@/lib/utils";
import { isOutOfHours } from "@/lib/bookingUtils";
import { mapCartDetailToTreatmentLine } from "@/lib/bookingCartLine";
import { composePhoneNumber } from "@/lib/phone";
import { createFormSchema, BookingFormValues, CreateBookingDialogProps } from "./CreateBookingDialog.schema";
import { BookingInfoStep } from "./steps/BookingInfoStep";
import { useSlotAvailability } from "@/hooks/booking/useSlotAvailability";
import { useAvailableRooms } from "@/hooks/booking/useAvailableRooms";
import { BookingPrestationsStep } from "./steps/BookingPrestationsStep";
import { BookingTherapistStep } from "./steps/BookingTherapistStep";
import { useAvailableTherapistsForSlot } from "@/hooks/booking/useAvailableTherapistsForSlot";
import { BookingPaymentStep } from "./steps/BookingPaymentStep";
import { useVenueAmenities, type VenueAmenity } from "@/hooks/useVenueAmenities";
import type { AmenityAccessPayload } from "@/hooks/booking/useCreateBookingMutation";
import {
  buildComboDuoBookingParams,
  computeStaffingCount,
  expandCartToSessions,
  getBaseSessionCount,
  getSessionCount,
  isComboDuoEligible,
} from "@/features/admin-combo-duo";

export default function CreateBookingDialog({ open, onOpenChange, selectedDate, selectedTime, presetHotelId }: CreateBookingDialogProps) {
  const { hotelIds, isAdmin } = useUserContext();
  const { showsConciergeUx: isConcierge } = useEffectiveRole();
  const canAssignTherapist = isAdmin || isConcierge;
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"info" | "prestations" | "therapist" | "payment">("info");
  const [visibleSlots, setVisibleSlots] = useState(1);

  const formSchema = useMemo(() => createFormSchema(t), [t]);
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      hotelId: presetHotelId || (isConcierge && hotelIds.length > 0 ? hotelIds[0] : ""),
      therapistId: "",
      date: selectedDate,
      time: selectedTime || "",
      slot2Date: undefined,
      slot2Time: "",
      slot3Date: undefined,
      slot3Time: "",
      clientType: "external",
      civility: undefined,
      clientFirstName: "",
      clientLastName: "",
      phone: "",
      countryCode: "+33",
      language: "fr",
      roomNumber: "",
      roomNumberLater: false,
      roomId: "",
      secondaryRoomId: "",
      clientNote: "",
      customerNote: "",
      payByVoucher: false,
      voucherReference: "",
      isOffert: false,
    },
  });

  const hotelId = form.watch("hotelId");
  const date = form.watch("date");
  const time = form.watch("time");
  const slot2Date = form.watch("slot2Date");
  const slot3Date = form.watch("slot3Date");
  const countryCode = form.watch("countryCode");
  const clientFirstName = form.watch("clientFirstName");
  const clientLastName = form.watch("clientLastName");
  const clientEmail = form.watch("clientEmail");
  const phone = form.watch("phone");
  const roomNumber = form.watch("roomNumber");
  const clientType = form.watch("clientType");
  const payByVoucher = form.watch("payByVoucher");
  const voucherReference = form.watch("voucherReference");
  const isOffert = form.watch("isOffert");
  const roomId = form.watch("roomId");
  const secondaryRoomId = form.watch("secondaryRoomId");

  // Date normalisée pour les requêtes de disponibilité.
  const dateStr = date ? format(date, "yyyy-MM-dd") : undefined;

  // Clear roomNumber when clientType switches away from 'hotel'
  // and reset voucher when moving to partner client types.
  useEffect(() => {
    if (clientType !== "hotel" && roomNumber) {
      form.setValue("roomNumber", "");
    }
    if (clientType !== "hotel" && form.getValues("roomNumberLater")) {
      form.setValue("roomNumberLater", false);
    }
    if (clientType !== "hotel" && clientType !== "external" && payByVoucher) {
      form.setValue("payByVoucher", false);
      form.setValue("voucherReference", "");
    }
  }, [clientType, roomNumber, payByVoucher, form]);

  const [createdBooking, setCreatedBooking] = useState<{ id: string; booking_id: number; hotel_name: string } | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [isNotificationDialogOpen, setIsNotificationDialogOpen] = useState(false);
  const [customPrice, setCustomPrice] = useState<string>("");
  const [customDuration, setCustomDuration] = useState<string>("");
  // Duo scindé sur 2 salles : toggle "salle différente pour le 2e praticien".
  const [secondaryRoomEnabled, setSecondaryRoomEnabled] = useState(false);

  useEffect(() => {
    if (selectedDate) form.setValue("date", selectedDate);
    if (selectedTime) form.setValue("time", selectedTime);
  }, [selectedDate, selectedTime]);


  const scope = useOrgScope();
  const { data: hotels } = useQuery({
    queryKey: hotelKeys.list(scope),
    enabled: !!scope,
    queryFn: () => listHotelsForOrg(supabase, scope!),
  });

  const selectedHotel = useMemo(() => hotels?.find(h => h.id === hotelId), [hotels, hotelId]);
  const hotelTimezone = selectedHotel?.timezone || "Europe/Paris";
  const venueSlotInterval = (selectedHotel as any)?.slot_interval || 30;

  const { isSlotAvailable, isLoading: isAvailabilityLoading } = useSlotAvailability({
    hotelId,
    dates: [date, slot2Date, slot3Date],
    slotInterval: venueSlotInterval,
    enabled: !canAssignTherapist,
  });

  const { data: therapists } = useQuery({
    queryKey: hotelId
      ? therapistKeys.forHotel(hotelId)
      : therapistKeys.activeForOrg(scope),
    enabled: hotelId ? true : !!scope,
    queryFn: () =>
      hotelId
        ? listActiveTherapistsForHotel(supabase, hotelId)
        : listActiveTherapistsForOrg(supabase, scope!),
  });

  const { data: treatments } = useQuery({
    queryKey: hotelId ? treatmentKeys.forHotel(hotelId) : treatmentKeys.list(scope),
    enabled: hotelId ? true : !!scope,
    queryFn: () =>
      hotelId
        ? listActiveTreatmentsForHotel(supabase, hotelId)
        : listTreatmentMenusForOrg(supabase, scope!, { includeNullHotel: true }),
  });

  const {
    cart, setCart, addToCart, incrementCart, decrementCart, removeCartLine, setLineOverride,
    getCartQuantity, totalPrice, totalDuration,
    hasOnRequestService, cartDetails,
  } = useBookingCart(treatments);

  // guest_count driven by the SELECTED variant for each cart item (not the max of all variants).
  // Falls back to 1 when no variant is selected or the treatment has no variants.
  const requiredGuestCount = useMemo(() => {
    if (!cartDetails.length) return 1;
    return Math.max(
      1,
      ...cartDetails.map((item) => {
        const variants = item.treatment?.treatment_variants ?? [];
        if (!variants.length) return 1;
        const selected = item.variantId
          ? variants.find(v => v.id === item.variantId)
          : null;
        return selected?.guest_count ?? 1;
      })
    );
  }, [cartDetails]);

  // admin-combo-duo
  const sessions = useMemo(() => expandCartToSessions(cartDetails), [cartDetails]);
  const sessionCount = useMemo(() => getSessionCount(cartDetails), [cartDetails]);
  // Base soins only (add-ons aren't parallel guests) → drives practitioner count.
  const baseSessionCount = useMemo(() => getBaseSessionCount(sessions), [sessions]);
  const comboDuoEligible = isComboDuoEligible(sessions) && requiredGuestCount <= 1;
  const [comboDuoEnabled, setComboDuoEnabled] = useState(false);

  useEffect(() => {
    if (!comboDuoEligible && comboDuoEnabled) setComboDuoEnabled(false);
  }, [comboDuoEligible, comboDuoEnabled]);

  const staffingCount = computeStaffingCount(comboDuoEnabled, baseSessionCount, requiredGuestCount);

  // Additional therapist IDs for duo/trio bookings (index 0 = therapist 2, etc.)
  const [additionalTherapistIds, setAdditionalTherapistIds] = useState<string[]>([]);
  const [duoMode, setDuoMode] = useState<"assign" | "broadcast">("assign");

  // Clear additional therapists when staffing drops to 1
  useEffect(() => {
    if (staffingCount <= 1) {
      setAdditionalTherapistIds([]);
    }
  }, [staffingCount]);

  const handleDuoModeChange = (mode: "assign" | "broadcast") => {
    setDuoMode(mode);
    if (mode === "broadcast") setAdditionalTherapistIds([]);
  };

  // Intersection of `available_days` for every cart item. A treatment with
  // `available_days = null` is unconstrained and doesn't shrink the set.
  // When the set is non-null, BookingInfoStep draws those weekdays as
  // struck-through / clickable (with a warning toast).
  const cartAvailableDays = useMemo<number[] | null>(() => {
    if (!cartDetails.length) return null;
    const sets = cartDetails
      .map((i) => (i.treatment as { available_days?: number[] | null } | undefined)?.available_days)
      .filter((days): days is number[] => Array.isArray(days) && days.length > 0);
    if (sets.length === 0) return null;
    return sets.reduce<number[]>((acc, days) =>
      acc.length === 0 ? [...days] : acc.filter((d) => days.includes(d)),
    []);
  }, [cartDetails]);

  // Venue amenities for "include amenity access" option
  const { amenities: venueAmenities } = useVenueAmenities(hotelId || "");
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);

  const handleToggleAmenity = (amenityId: string, enabled: boolean) => {
    setSelectedAmenityIds((prev) =>
      enabled ? [...prev, amenityId] : prev.filter((id) => id !== amenityId)
    );
  };

  const amenityAccessPayload: AmenityAccessPayload[] = selectedAmenityIds
    .map((id) => {
      const a = venueAmenities.find((va) => va.id === id);
      if (!a) return null;
      return {
        venueAmenityId: a.id,
        duration: a.lymfea_access_included ? (a.lymfea_access_duration || a.slot_duration) : a.slot_duration,
        price: a.lymfea_access_included ? 0 : (Number(a.price_lymfea) || 0),
      };
    })
    .filter((x): x is AmenityAccessPayload => x !== null);

  const canEditPrice = isAdmin || isConcierge;

  useEffect(() => {
    if (canEditPrice && hasOnRequestService && cart.length > 0) {
      if (!customPrice) setCustomPrice(String(totalPrice));
      if (!customDuration) setCustomDuration(String(totalDuration));
    }
    if (!hasOnRequestService) {
      setCustomPrice("");
      setCustomDuration("");
    }
  }, [totalPrice, totalDuration, cart.length, canEditPrice, hasOnRequestService]);

  const finalPrice = canEditPrice && hasOnRequestService && customPrice ? Number(customPrice) : totalPrice;
  const catalogDuration = comboDuoEnabled
    ? buildComboDuoBookingParams(sessions).duration
    : totalDuration;
  const finalDuration = canEditPrice && hasOnRequestService && customDuration
    ? Number(customDuration)
    : catalogDuration;

  // Salles de soin disponibles au créneau choisi (pré-sélection auto + override).
  const { rooms, occupiedRoomIds, roomOccupancy } = useAvailableRooms(
    hotelId,
    dateStr,
    time,
    finalDuration || 30,
  );

  // Out-of-hours surcharge detection
  const isBookingOutOfHours = useMemo(() => {
    if (!isAdmin || !selectedHotel?.allow_out_of_hours_booking) return false;
    return isOutOfHours(time, selectedHotel.opening_time || '10:00', selectedHotel.closing_time || '20:00');
  }, [isAdmin, selectedHotel, time]);

  const surchargePercent = selectedHotel?.out_of_hours_surcharge_percent || 0;
  const surchargeAmount = isBookingOutOfHours ? Math.round(finalPrice * surchargePercent / 100) : 0;
  const finalPriceWithSurcharge = finalPrice + surchargeAmount;

  // Liste annotée pour l'étape d'assignation : sections « Disponibles » / « Autres ».
  // Pas de treatmentIds : même population que la liste plate (thérapeutes actifs du lieu).
  const { data: slotTherapists } = useAvailableTherapistsForSlot({
    hotelId,
    date,
    time,
    durationMinutes: finalDuration || 60,
  });

  const mutation = useCreateBookingMutation({
    hotels,
    therapists,
    onSuccess: (data) => {
      if (data) {
        setCreatedBooking({
          id: data.id,
          booking_id: data.booking_id,
          hotel_name: data.hotel_name || '',
        });
        const ct = form.getValues("clientType");
        const byVoucher = form.getValues("payByVoucher");
        const offered = form.getValues("isOffert");
        const skipStripe = ct !== "external" || byVoucher || offered;
        if (isConcierge) {
          const isExternal = ct === "external" && !byVoucher && !offered;
          const isBroadcastBooking = data.status === "pending";
          // External clients: show the booking-created recap step first (same as
          // admin), then send the payment link from there.
          if (isExternal) {
            setActiveTab("payment");
          } else if (isBroadcastBooking) {
            // Non-external broadcast: operator sends client comms manually.
            setIsNotificationDialogOpen(true);
          } else {
            handleClose();
          }
        } else if (skipStripe) {
          // Admin partner-billed/voucher: trigger-new-booking-notifications already
          // sent the client confirmation email + SMS. Avoid a duplicate — just close.
          handleClose();
        } else {
          // Admin external: route to the Stripe payment link flow.
          setActiveTab("payment");
        }
      } else {
        handleClose();
      }
    },
  });

  const validateInfo = async () => {
    const fields: (keyof BookingFormValues)[] = [
      "hotelId", "clientFirstName", "clientLastName", "phone", "date", "time", "roomNumber",
    ];
    const result = await form.trigger(fields);
    const values = form.getValues();
    // Admins may backdate bookings (e.g. recording a walk-in after the fact),
    // so no future-date constraint is enforced on the slots here.
    // Duplicate slot validation
    const slot1Key = values.date && values.time ? `${format(values.date, "yyyy-MM-dd")}-${values.time}` : null;
    const slot2Key = values.slot2Date && values.slot2Time ? `${format(values.slot2Date, "yyyy-MM-dd")}-${values.slot2Time}` : null;
    const slot3Key = values.slot3Date && values.slot3Time ? `${format(values.slot3Date, "yyyy-MM-dd")}-${values.slot3Time}` : null;
    if (slot2Key && slot1Key && slot2Key === slot1Key) {
      form.setError("slot2Time", { message: "Ce créneau est identique au créneau 1" });
      return false;
    }
    if (slot3Key && slot1Key && slot3Key === slot1Key) {
      form.setError("slot3Time", { message: "Ce créneau est identique au créneau 1" });
      return false;
    }
    if (slot3Key && slot2Key && slot3Key === slot2Key) {
      form.setError("slot3Time", { message: "Ce créneau est identique au créneau 2" });
      return false;
    }
    return result;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cart.length) {
      toast({ title: "Sélectionnez une prestation", variant: "destructive" });
      return;
    }
    const values = form.getValues();
    if (canAssignTherapist && duoMode !== "broadcast") {
      if (staffingCount > 1) {
        const assigned = [values.therapistId, ...additionalTherapistIds].filter(Boolean);
        if (assigned.length < staffingCount) {
          toast({ title: "Veuillez sélectionner tous les thérapeutes ou diffuser", variant: "destructive" });
          return;
        }
      } else if (!values.therapistId) {
        toast({ title: "Veuillez sélectionner un thérapeute ou diffuser", variant: "destructive" });
        return;
      }
    }
    const isBroadcast = duoMode === "broadcast" || !values.therapistId;
    const comboParams = comboDuoEnabled ? buildComboDuoBookingParams(sessions) : null;
    const treatments = comboParams?.treatments ?? cart.flatMap(item =>
      Array.from({ length: item.quantity }, () => ({
        treatmentId: item.treatmentId,
        variantId: item.variantId || undefined,
        priceOverride: item.priceOverride ?? null,
      }))
    );
    const offered = values.isOffert;
    mutation.mutate({
      hotelId: values.hotelId,
      clientFirstName: values.clientFirstName,
      clientLastName: values.clientLastName,
      clientEmail: values.clientEmail || undefined,
      phone: values.phone,
      countryCode: values.countryCode,
      civility: values.civility,
      language: values.language,
      roomNumber: values.roomNumber,
      clientNote: values.clientNote,
      customerNote: values.customerNote,
      date: values.date ? format(values.date, "yyyy-MM-dd") : "",
      time: values.time,
      therapistId: values.therapistId,
      roomId: values.roomId || undefined,
      // Salle secondaire seulement pour un Duo scindé (toggle activé).
      secondaryRoomId:
        secondaryRoomEnabled && staffingCount > 1 ? values.secondaryRoomId || "" : undefined,
      slot2Date: values.slot2Date ? format(values.slot2Date, "yyyy-MM-dd") : null,
      slot2Time: values.slot2Time || null,
      slot3Date: values.slot3Date ? format(values.slot3Date, "yyyy-MM-dd") : null,
      slot3Time: values.slot3Time || null,
      treatmentIds: [],
      treatments,
      totalPrice: offered ? 0 : finalPriceWithSurcharge,
      totalDuration: finalDuration,
      isAdmin,
      isOutOfHours: offered ? false : isBookingOutOfHours,
      surchargeAmount: offered ? 0 : surchargeAmount,
      amenityAccess: amenityAccessPayload.length > 0 ? amenityAccessPayload : undefined,
      clientType: values.clientType,
      payByVoucher: values.payByVoucher,
      voucherReference: values.voucherReference?.trim() || null,
      isOffert: offered,
      // Origine = rôle du créateur : "concierge" (Gestion du lieu) vs "admin" (dashboard).
      source: isConcierge ? "concierge" : "admin",
      guestCount: comboDuoEnabled ? comboParams!.guestCount : requiredGuestCount,
      comboDuo: comboDuoEnabled,
      isBroadcast,
      ...(staffingCount > 1 && duoMode === "assign"
        ? { therapistIds: [values.therapistId, ...additionalTherapistIds].filter(Boolean) }
        : {}),
    });
  };

  const hasUnsavedChanges = () => {
    if (activeTab === "payment") return false;
    return form.formState.isDirty || cart.length > 0;
  };

  const handleRequestClose = () => {
    if (hasUnsavedChanges()) {
      setShowConfirmClose(true);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setShowConfirmClose(false);
    setActiveTab("info");
    setSecondaryRoomEnabled(false);
    form.reset({
      hotelId: presetHotelId || "",
      therapistId: "",
      date: selectedDate,
      time: selectedTime || "",
      slot2Date: undefined,
      slot2Time: "",
      slot3Date: undefined,
      slot3Time: "",
      clientType: "external",
      civility: undefined,
      clientFirstName: "",
      clientLastName: "",
      phone: "",
      countryCode: "+33",
      language: "fr",
      roomNumber: "",
      roomNumberLater: false,
      roomId: "",
      secondaryRoomId: "",
      clientNote: "",
      customerNote: "",
      payByVoucher: false,
      voucherReference: "",
      isOffert: false,
    });
    setCart([]);
    setCustomPrice("");
    setCustomDuration("");
    setSelectedAmenityIds([]);
    setAdditionalTherapistIds([]);
    setDuoMode("assign");
    setComboDuoEnabled(false);
    setCreatedBooking(null);
    onOpenChange(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleRequestClose(); }}>
      <DialogContent
        className={cn(
          "h-[92vh] p-0 gap-0 flex flex-col overflow-hidden",
          activeTab === "prestations" ? "sm:max-w-[880px]" : "max-w-3xl",
        )}
        onPointerDownOutside={(e) => { if (hasUnsavedChanges()) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (hasUnsavedChanges()) e.preventDefault(); }}
      >
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-lg font-semibold">
            {isConcierge ? "Nouvelle demande" : "Nouvelle réservation"}
          </DialogTitle>
          <BookingWizardStepper
            currentStep={
              activeTab === "info" ? 1
              : activeTab === "prestations" ? 2
              : activeTab === "therapist" ? 3
              : 4
            }
          />
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "info" | "prestations" | "therapist" | "payment")} className="flex-1 flex flex-col min-h-0">
              <TabsContent value="info" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
                <BookingInfoStep
                  form={form}
                  isAdmin={isAdmin}
                  isConcierge={isConcierge}
                  hotelIds={hotelIds}
                  hotels={hotels}
                  hotelTimezone={hotelTimezone}
                  hotelId={hotelId}
                  countryCode={countryCode}
                  visibleSlots={visibleSlots}
                  setVisibleSlots={setVisibleSlots}
                  isBookingOutOfHours={isBookingOutOfHours}
                  surchargePercent={surchargePercent}
                  pmsLookupEnabled={!!(selectedHotel as any)?.pms_guest_lookup_enabled}
                  isSlotAvailable={isSlotAvailable}
                  isAvailabilityLoading={isAvailabilityLoading}
                  slotInterval={venueSlotInterval}
                  staffTimePicker={canAssignTherapist}
                  cartAvailableDays={cartAvailableDays}
                  onValidateAndNext={async () => { if (await validateInfo()) setActiveTab("prestations"); }}
                  onCancel={handleClose}
                />
              </TabsContent>

            <TabsContent value="prestations" className="flex-1 flex flex-col min-h-0 mt-0 px-0 pb-0 data-[state=inactive]:hidden">
                <BookingPrestationsStep
                  treatments={treatments}
                  selectedHotel={selectedHotel}
                  isAdmin={isAdmin}
                  isConcierge={isConcierge}
                  cart={cart}
                  cartDetails={cartDetails}
                  addToCart={addToCart}
                  incrementCart={incrementCart}
                  decrementCart={decrementCart}
                  removeCartLine={removeCartLine}
                  setLineOverride={setLineOverride}
                  getCartQuantity={getCartQuantity}
                  totalPrice={totalPrice}
                  totalDuration={totalDuration}
                  hasOnRequestService={hasOnRequestService}
                  finalPrice={finalPrice}
                  customPrice={customPrice}
                  setCustomPrice={setCustomPrice}
                  customDuration={customDuration}
                  setCustomDuration={setCustomDuration}
                  isBookingOutOfHours={isBookingOutOfHours}
                  surchargeAmount={surchargeAmount}
                  surchargePercent={surchargePercent}
                  finalPriceWithSurcharge={finalPriceWithSurcharge}
                  isPending={mutation.isPending}
                  onBack={() => setActiveTab("info")}
                  onNext={canAssignTherapist ? () => {
                    if (!cart.length) {
                      toast({ title: "Sélectionnez une prestation", variant: "destructive" });
                      return;
                    }
                    setActiveTab("therapist");
                  } : undefined}
                  venueAmenities={venueAmenities}
                  selectedAmenityIds={selectedAmenityIds}
                  onToggleAmenity={handleToggleAmenity}
                  clientType={clientType}
                  payByVoucher={payByVoucher}
                  onPayByVoucherChange={(v) => {
                    form.setValue("payByVoucher", v);
                    if (v) form.setValue("isOffert", false);
                  }}
                  voucherReference={voucherReference}
                  onVoucherReferenceChange={(v) => form.setValue("voucherReference", v)}
                  comboDuoEligible={comboDuoEligible}
                  comboDuoEnabled={comboDuoEnabled}
                  onComboDuoChange={setComboDuoEnabled}
                  sessionCount={sessionCount}
                  practitionerCount={baseSessionCount}
                  variantDuoInCart={requiredGuestCount > 1}
                  canOffer={canAssignTherapist}
                  isOffert={isOffert}
                  onIsOffertChange={(v) => {
                    form.setValue("isOffert", v);
                    if (v) {
                      form.setValue("payByVoucher", false);
                      form.setValue("voucherReference", "");
                    }
                  }}
                />
            </TabsContent>

            <TabsContent value="therapist" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
                <BookingTherapistStep
                  therapists={slotTherapists ?? therapists}
                  therapistId={form.watch("therapistId")}
                  onTherapistChange={(id) => form.setValue("therapistId", id)}
                  requiredGuestCount={requiredGuestCount}
                  staffingCount={staffingCount}
                  additionalTherapistIds={additionalTherapistIds}
                  onAdditionalTherapistIdsChange={setAdditionalTherapistIds}
                  duoMode={duoMode}
                  onDuoModeChange={handleDuoModeChange}
                  isConcierge={isConcierge}
                  isPending={mutation.isPending}
                  onBack={() => setActiveTab("prestations")}
                  cart={cart}
                  cartDetails={cartDetails}
                  finalPriceWithSurcharge={isOffert ? 0 : finalPriceWithSurcharge}
                  currency={selectedHotel?.currency || 'EUR'}
                  rooms={rooms}
                  occupiedRoomIds={occupiedRoomIds}
                  roomOccupancy={roomOccupancy}
                  roomId={roomId}
                  onRoomChange={(id) => form.setValue("roomId", id)}
                  secondaryRoomId={secondaryRoomId}
                  onSecondaryRoomChange={(id) => form.setValue("secondaryRoomId", id)}
                  secondaryRoomEnabled={secondaryRoomEnabled}
                  onSecondaryRoomEnabledChange={(enabled) => {
                    setSecondaryRoomEnabled(enabled);
                    if (!enabled) form.setValue("secondaryRoomId", "");
                  }}
                />
            </TabsContent>

            <TabsContent value="payment" className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-3 data-[state=inactive]:hidden">
                {createdBooking && (
                  <BookingPaymentStep
                    createdBooking={createdBooking}
                    isAdmin={isAdmin}
                    isConcierge={isConcierge}
                    clientFirstName={clientFirstName}
                    clientLastName={clientLastName}
                    finalPrice={finalPriceWithSurcharge}
                    currency={selectedHotel?.currency || 'EUR'}
                    clientType={clientType}
                    onSendPaymentLink={() => setIsNotificationDialogOpen(true)}
                    onClose={handleClose}
                  />
                )}
            </TabsContent>
          </Tabs>
        </form>
        </Form>
      </DialogContent>
    </Dialog>

    {createdBooking && (() => {
      const sharedBooking = {
        id: createdBooking.id,
        booking_id: createdBooking.booking_id,
        client_first_name: clientFirstName,
        client_last_name: clientLastName,
        client_email: clientEmail || undefined,
        phone: composePhoneNumber(countryCode, phone),
        room_number: roomNumber || undefined,
        booking_date: date ? format(date, "yyyy-MM-dd") : "",
        booking_time: time,
        total_price: isOffert ? 0 : finalPriceWithSurcharge,
        hotel_name: createdBooking.hotel_name,
        treatments: cartDetails.map(item => ({
          name: item.treatment?.name || 'Service',
          price: (item.treatment?.price || 0) * item.quantity,
        })),
        currency: selectedHotel?.currency || 'EUR',
      };
      const handleSuccessAndClose = () => {
        setIsNotificationDialogOpen(false);
        handleClose();
      };
      const handleOpenChange = (open: boolean) => {
        setIsNotificationDialogOpen(open);
        if (!open) handleClose();
      };
      return clientType === "external" ? (
        <SendPaymentLinkDialog
          open={isNotificationDialogOpen}
          onOpenChange={handleOpenChange}
          booking={sharedBooking}
          onSuccess={handleSuccessAndClose}
        />
      ) : (
        <SendBookingNotificationDialog
          open={isNotificationDialogOpen}
          onOpenChange={handleOpenChange}
          booking={sharedBooking}
          onSuccess={handleSuccessAndClose}
        />
      );
    })()}

    <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Abandonner la réservation ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les informations saisies seront perdues. Êtes-vous sûr de vouloir quitter ?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuer la saisie</AlertDialogCancel>
          <AlertDialogAction onClick={handleClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Abandonner
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
