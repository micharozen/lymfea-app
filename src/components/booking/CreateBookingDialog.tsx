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
import { useBookingCart } from "@/hooks/booking/useBookingCart";
import { useCreateBookingMutation } from "@/hooks/booking/useCreateBookingMutation";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import { BookingWizardStepper } from "@/components/ui/BookingWizardStepper";
import { format } from "date-fns";
import { formatPrice } from "@/lib/formatPrice";
import { cn } from "@/lib/utils";
import { createFormSchema, BookingFormValues, CreateBookingDialogProps } from "./CreateBookingDialog.schema";
import { BookingInfoStep } from "./steps/BookingInfoStep";
import { BookingPrestationsStep } from "./steps/BookingPrestationsStep";
import { BookingPaymentStep } from "./steps/BookingPaymentStep";

export default function CreateBookingDialog({ open, onOpenChange, selectedDate, selectedTime }: CreateBookingDialogProps) {
  const { isConcierge, hotelIds } = useUserContext();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"info" | "prestations" | "payment">("info");
  const [visibleSlots, setVisibleSlots] = useState(1);

  const formSchema = useMemo(() => createFormSchema(t), [t]);
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      hotelId: isConcierge && hotelIds.length > 0 ? hotelIds[0] : "",
      hairdresserId: "",
      date: selectedDate,
      time: selectedTime || "",
      slot2Date: undefined,
      slot2Time: "",
      slot3Date: undefined,
      slot3Time: "",
      clientFirstName: "",
      clientLastName: "",
      phone: "",
      countryCode: "+33",
      roomNumber: "",
    },
  });

  const hotelId = form.watch("hotelId");
  const date = form.watch("date");
  const time = form.watch("time");
  const countryCode = form.watch("countryCode");
  const clientFirstName = form.watch("clientFirstName");
  const clientLastName = form.watch("clientLastName");
  const phone = form.watch("phone");
  const roomNumber = form.watch("roomNumber");

  const [createdBooking, setCreatedBooking] = useState<{ id: string; booking_id: number; hotel_name: string } | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [isPaymentLinkDialogOpen, setIsPaymentLinkDialogOpen] = useState(false);
  const [customPrice, setCustomPrice] = useState<string>("");
  const [customDuration, setCustomDuration] = useState<string>("");

  useEffect(() => {
    if (selectedDate) form.setValue("date", selectedDate);
    if (selectedTime) form.setValue("time", selectedTime);
  }, [selectedDate, selectedTime]);

  const { data: userRole } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
      return data?.role;
    },
  });

  const isAdmin = userRole === "admin";

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data } = await supabase.from("hotels").select("id, name, timezone, currency").order("name");
      return data || [];
    }
  });

  const selectedHotel = useMemo(() => hotels?.find(h => h.id === hotelId), [hotels, hotelId]);
  const hotelTimezone = selectedHotel?.timezone || "Europe/Paris";

  const { data: hairdressers } = useQuery({
    queryKey: ["hairdressers-for-hotel", hotelId],
    queryFn: async () => {
      if (!hotelId) {
        const { data } = await supabase.from("hairdressers").select("id, first_name, last_name, status").in("status", ["Actif", "active", "Active"]).order("first_name");
        return data || [];
      }
      const { data } = await supabase.from("hairdresser_hotels").select(`hairdresser_id, hairdressers (id, first_name, last_name, status)`).eq("hotel_id", hotelId);
      return data?.map((hh: any) => hh.hairdressers).filter((h: any) => h && ["Actif", "active", "Active"].includes(h.status)).sort((a: any, b: any) => a.first_name.localeCompare(b.first_name)) || [];
    },
  });

  const { data: treatments } = useQuery({
    queryKey: ["treatment_menus", hotelId],
    queryFn: async () => {
      let q = supabase.from("treatment_menus").select("*").in("status", ["Actif", "active", "Active"]).order("sort_order", { ascending: true, nullsFirst: false }).order("name");
      if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
      const { data } = await q;
      return data || [];
    },
  });

  const {
    cart, setCart, addToCart, incrementCart, decrementCart,
    getCartQuantity, flatIds, totalPrice, totalDuration,
    hasOnRequestService, cartDetails,
  } = useBookingCart(treatments);

  useEffect(() => {
    if (isAdmin && hasOnRequestService && cart.length > 0) {
      if (!customPrice) setCustomPrice(String(totalPrice));
      if (!customDuration) setCustomDuration(String(totalDuration));
    }
    if (!hasOnRequestService) {
      setCustomPrice("");
      setCustomDuration("");
    }
  }, [totalPrice, totalDuration, cart.length, isAdmin, hasOnRequestService]);

  const finalPrice = isAdmin && hasOnRequestService && customPrice ? Number(customPrice) : totalPrice;
  const finalDuration = isAdmin && hasOnRequestService && customDuration ? Number(customDuration) : totalDuration;

  const mutation = useCreateBookingMutation({
    hotels,
    hairdressers,
    onSuccess: (data) => {
      if (data) {
        setCreatedBooking({
          id: data.id,
          booking_id: data.booking_id,
          hotel_name: data.hotel_name || '',
        });
        setActiveTab("payment");
      } else {
        handleClose();
      }
    },
  });

  const validateInfo = async () => {
    const fields: (keyof BookingFormValues)[] = [
      "hotelId", "clientFirstName", "clientLastName", "phone", "date", "time",
    ];
    const result = await form.trigger(fields);
    if (isAdmin && !form.getValues("hairdresserId")) {
      form.setError("hairdresserId", { message: "Veuillez sélectionner un coiffeur" });
      return false;
    }
    const now = new Date();
    const values = form.getValues();
    if (values.date && values.time) {
      const [h, m] = values.time.split(':').map(Number);
      const slotDateTime = new Date(values.date);
      slotDateTime.setHours(h, m, 0, 0);
      if (slotDateTime <= now) {
        form.setError("time", { message: "Le créneau doit être dans le futur" });
        return false;
      }
    }
    if (values.slot2Date && values.slot2Time) {
      const [h, m] = values.slot2Time.split(':').map(Number);
      const slotDateTime = new Date(values.slot2Date);
      slotDateTime.setHours(h, m, 0, 0);
      if (slotDateTime <= now) {
        form.setError("slot2Time", { message: "Le créneau doit être dans le futur" });
        return false;
      }
    }
    if (values.slot3Date && values.slot3Time) {
      const [h, m] = values.slot3Time.split(':').map(Number);
      const slotDateTime = new Date(values.slot3Date);
      slotDateTime.setHours(h, m, 0, 0);
      if (slotDateTime <= now) {
        form.setError("slot3Time", { message: "Le créneau doit être dans le futur" });
        return false;
      }
    }
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
    mutation.mutate({
      hotelId: values.hotelId,
      clientFirstName: values.clientFirstName,
      clientLastName: values.clientLastName,
      phone: values.phone,
      countryCode: values.countryCode,
      roomNumber: values.roomNumber,
      date: values.date ? format(values.date, "yyyy-MM-dd") : "",
      time: values.time,
      hairdresserId: values.hairdresserId,
      slot2Date: values.slot2Date ? format(values.slot2Date, "yyyy-MM-dd") : null,
      slot2Time: values.slot2Time || null,
      slot3Date: values.slot3Date ? format(values.slot3Date, "yyyy-MM-dd") : null,
      slot3Time: values.slot3Time || null,
      treatmentIds: flatIds,
      totalPrice: finalPrice,
      totalDuration: finalDuration,
      isAdmin,
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
    form.reset({
      hotelId: "",
      hairdresserId: "",
      date: selectedDate,
      time: selectedTime || "",
      slot2Date: undefined,
      slot2Time: "",
      slot3Date: undefined,
      slot3Time: "",
      clientFirstName: "",
      clientLastName: "",
      phone: "",
      countryCode: "+33",
      roomNumber: "",
    });
    setCart([]);
    setCustomPrice("");
    setCustomDuration("");
    setCreatedBooking(null);
    onOpenChange(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleRequestClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-xl p-0 gap-0 flex flex-col overflow-hidden" onPointerDownOutside={(e) => { if (hasUnsavedChanges()) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (hasUnsavedChanges()) e.preventDefault(); }}>
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-lg font-semibold">
            Nouvelle réservation
          </DialogTitle>
          <BookingWizardStepper
            currentStep={activeTab === "info" ? 1 : activeTab === "prestations" ? 2 : 3}
          />
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "info" | "prestations" | "payment")} className="flex-1 flex flex-col min-h-0">
              <TabsContent value="info" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
                <BookingInfoStep
                  form={form}
                  isAdmin={isAdmin}
                  isConcierge={isConcierge}
                  hotelIds={hotelIds}
                  hotels={hotels}
                  hairdressers={hairdressers}
                  hotelTimezone={hotelTimezone}
                  hotelId={hotelId}
                  countryCode={countryCode}
                  visibleSlots={visibleSlots}
                  setVisibleSlots={setVisibleSlots}
                  onValidateAndNext={async () => { if (await validateInfo()) setActiveTab("prestations"); }}
                  onCancel={handleClose}
                />
              </TabsContent>

            <TabsContent value="prestations" className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-4 pt-1 data-[state=inactive]:hidden max-h-[60vh]">
                <BookingPrestationsStep
                  treatments={treatments}
                  selectedHotel={selectedHotel}
                  isAdmin={isAdmin}
                  cart={cart}
                  cartDetails={cartDetails}
                  addToCart={addToCart}
                  incrementCart={incrementCart}
                  decrementCart={decrementCart}
                  getCartQuantity={getCartQuantity}
                  totalPrice={totalPrice}
                  totalDuration={totalDuration}
                  hasOnRequestService={hasOnRequestService}
                  finalPrice={finalPrice}
                  customPrice={customPrice}
                  setCustomPrice={setCustomPrice}
                  customDuration={customDuration}
                  setCustomDuration={setCustomDuration}
                  isPending={mutation.isPending}
                  onBack={() => setActiveTab("info")}
                />
            </TabsContent>

            <TabsContent value="payment" className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-3 data-[state=inactive]:hidden">
                {createdBooking && (
                  <BookingPaymentStep
                    createdBooking={createdBooking}
                    isAdmin={isAdmin}
                    clientFirstName={clientFirstName}
                    clientLastName={clientLastName}
                    finalPrice={finalPrice}
                    currency={selectedHotel?.currency || 'EUR'}
                    onSendPaymentLink={() => setIsPaymentLinkDialogOpen(true)}
                    onClose={handleClose}
                  />
                )}
            </TabsContent>
          </Tabs>
        </form>
        </Form>
      </DialogContent>
    </Dialog>

    {createdBooking && (
      <SendPaymentLinkDialog
        open={isPaymentLinkDialogOpen}
        onOpenChange={setIsPaymentLinkDialogOpen}
        booking={{
          id: createdBooking.id,
          booking_id: createdBooking.booking_id,
          client_first_name: clientFirstName,
          client_last_name: clientLastName,
          phone: `${countryCode} ${phone}`,
          room_number: roomNumber || undefined,
          booking_date: date ? format(date, "yyyy-MM-dd") : "",
          booking_time: time,
          total_price: finalPrice,
          hotel_name: createdBooking.hotel_name,
          treatments: cartDetails.map(item => ({
            name: item.treatment?.name || 'Service',
            price: (item.treatment?.price || 0) * item.quantity,
          })),
          currency: selectedHotel?.currency || 'EUR',
        }}
        onSuccess={() => {
          setIsPaymentLinkDialogOpen(false);
          handleClose();
        }}
      />
    )}

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
