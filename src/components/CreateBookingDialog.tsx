import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import { useUserContext } from "@/hooks/useUserContext";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import { BookingWizardStepper } from "@/components/ui/BookingWizardStepper";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, ChevronDown, Plus, Minus, Globe, Loader2, Send, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { getCurrentOffset } from "@/lib/timezones";

const countries = [
  { code: "+27", label: "Afrique du Sud", flag: "🇿🇦" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+966", label: "Arabie Saoudite", flag: "🇸🇦" },
  { code: "+54", label: "Argentine", flag: "🇦🇷" },
  { code: "+61", label: "Australie", flag: "🇦🇺" },
  { code: "+43", label: "Autriche", flag: "🇦🇹" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+55", label: "Brésil", flag: "🇧🇷" },
  { code: "+86", label: "Chine", flag: "🇨🇳" },
  { code: "+82", label: "Corée du Sud", flag: "🇰🇷" },
  { code: "+45", label: "Danemark", flag: "🇩🇰" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
  { code: "+20", label: "Égypte", flag: "🇪🇬" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+1", label: "États-Unis", flag: "🇺🇸" },
  { code: "+358", label: "Finlande", flag: "🇫🇮" },
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+30", label: "Grèce", flag: "🇬🇷" },
  { code: "+36", label: "Hongrie", flag: "🇭🇺" },
  { code: "+91", label: "Inde", flag: "🇮🇳" },
  { code: "+62", label: "Indonésie", flag: "🇮🇩" },
  { code: "+353", label: "Irlande", flag: "🇮🇪" },
  { code: "+972", label: "Israël", flag: "🇮🇱" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+81", label: "Japon", flag: "🇯🇵" },
  { code: "+965", label: "Koweït", flag: "🇰🇼" },
  { code: "+352", label: "Luxembourg", flag: "🇱🇺" },
  { code: "+60", label: "Malaisie", flag: "🇲🇾" },
  { code: "+212", label: "Maroc", flag: "🇲🇦" },
  { code: "+52", label: "Mexique", flag: "🇲🇽" },
  { code: "+377", label: "Monaco", flag: "🇲🇨" },
  { code: "+47", label: "Norvège", flag: "🇳🇴" },
  { code: "+64", label: "Nouvelle-Zélande", flag: "🇳🇿" },
  { code: "+31", label: "Pays-Bas", flag: "🇳🇱" },
  { code: "+63", label: "Philippines", flag: "🇵🇭" },
  { code: "+48", label: "Pologne", flag: "🇵🇱" },
  { code: "+351", label: "Portugal", flag: "🇵🇹" },
  { code: "+974", label: "Qatar", flag: "🇶🇦" },
  { code: "+44", label: "Royaume-Uni", flag: "🇬🇧" },
  { code: "+7", label: "Russie", flag: "🇷🇺" },
  { code: "+65", label: "Singapour", flag: "🇸🇬" },
  { code: "+46", label: "Suède", flag: "🇸🇪" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+420", label: "Tchéquie", flag: "🇨🇿" },
  { code: "+66", label: "Thaïlande", flag: "🇹🇭" },
  { code: "+216", label: "Tunisie", flag: "🇹🇳" },
  { code: "+90", label: "Turquie", flag: "🇹🇷" },
  { code: "+84", label: "Vietnam", flag: "🇻🇳" },
];

const formatPhoneNumber = (value: string, countryCode: string): string => {
  const numbers = value.replace(/\D/g, '');
  switch (countryCode) {
    case "+33":
      const fr = numbers.slice(0, 10);
      if (fr.length <= 1) return fr;
      if (fr.length <= 3) return `${fr.slice(0, 1)} ${fr.slice(1)}`;
      if (fr.length <= 5) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3)}`;
      if (fr.length <= 7) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5)}`;
      if (fr.length <= 9) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5, 7)} ${fr.slice(7)}`;
      return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5, 7)} ${fr.slice(7, 9)} ${fr.slice(9, 10)}`;
    case "+971":
      const uae = numbers.slice(0, 9);
      if (uae.length <= 1) return uae;
      if (uae.length <= 4) return `${uae.slice(0, 1)} ${uae.slice(1)}`;
      if (uae.length <= 7) return `${uae.slice(0, 1)} ${uae.slice(1, 4)} ${uae.slice(4)}`;
      return `${uae.slice(0, 1)} ${uae.slice(1, 4)} ${uae.slice(4, 7)} ${uae.slice(7)}`;
    default:
      return numbers.slice(0, 15);
  }
};

// Zod schema for Step 1 (Info) fields
const createFormSchema = (t: TFunction) => z.object({
  hotelId: z.string().min(1, t('errors.validation.hotelRequired')),
  hairdresserId: z.string().default(""),
  date: z.date({ required_error: t('errors.validation.dateRequired') }),
  time: z.string().min(1, t('errors.validation.timeRequired')),
  clientFirstName: z.string().min(1, t('errors.validation.firstNameRequired')),
  clientLastName: z.string().min(1, t('errors.validation.lastNameRequired')),
  phone: z.string().min(1, t('errors.validation.phoneRequired')),
  countryCode: z.string().default("+33"),
  roomNumber: z.string().default(""),
});

type BookingFormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface CartItem { treatmentId: string; quantity: number; }

interface CreateBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date;
  selectedTime?: string;
}

export default function CreateBookingDialog({ open, onOpenChange, selectedDate, selectedTime }: CreateBookingDialogProps) {
  const queryClient = useQueryClient();
  const { isConcierge, hotelIds } = useUserContext();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"info" | "prestations" | "payment">("info");

  // Zod + react-hook-form
  const formSchema = useMemo(() => createFormSchema(t), [t]);
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      hotelId: isConcierge && hotelIds.length > 0 ? hotelIds[0] : "",
      hairdresserId: "",
      date: selectedDate,
      time: selectedTime || "",
      clientFirstName: "",
      clientLastName: "",
      phone: "",
      countryCode: "+33",
      roomNumber: "",
    },
  });

  // Watch form values needed outside the form
  const hotelId = form.watch("hotelId");
  const date = form.watch("date");
  const time = form.watch("time");
  const countryCode = form.watch("countryCode");
  const clientFirstName = form.watch("clientFirstName");
  const clientLastName = form.watch("clientLastName");
  const phone = form.watch("phone");
  const roomNumber = form.watch("roomNumber");
  const hairdresserId = form.watch("hairdresserId");

  // Payment link state for step 3
  const [createdBooking, setCreatedBooking] = useState<{
    id: string;
    booking_id: number;
    hotel_name: string;
  } | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [treatmentFilter, setTreatmentFilter] = useState<"female" | "male">("female");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [hourOpen, setHourOpen] = useState(false);
  const [minuteOpen, setMinuteOpen] = useState(false);

  // Confirmation dialog for unsaved changes
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [isPaymentLinkDialogOpen, setIsPaymentLinkDialogOpen] = useState(false);

  // Admin-only custom price/duration overrides
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

  const { totalPrice, totalDuration } = useMemo(() => {
    if (!treatments || !cart.length) return { totalPrice: 0, totalDuration: 0 };
    let p = 0, d = 0;
    cart.forEach(i => { 
      const t = treatments.find(x => x.id === i.treatmentId); 
      if (t) { 
        p += (t.price || 0) * i.quantity; 
        d += (t.duration || 0) * i.quantity; 
      }
    });
    return { totalPrice: p, totalDuration: d };
  }, [cart, treatments]);

  // Check if cart contains any "on request" services
  const hasOnRequestService = useMemo(() => {
    return cart.some(item => {
      const treatment = treatments?.find(t => t.id === item.treatmentId);
      return treatment?.price_on_request === true;
    });
  }, [cart, treatments]);

  // Update custom fields when cart changes (pre-fill with defaults) - only for on-request services
  useEffect(() => {
    if (isAdmin && hasOnRequestService && cart.length > 0) {
      if (!customPrice) setCustomPrice(String(totalPrice));
      if (!customDuration) setCustomDuration(String(totalDuration));
    }
    // Clear custom fields if no on-request services
    if (!hasOnRequestService) {
      setCustomPrice("");
      setCustomDuration("");
    }
  }, [totalPrice, totalDuration, cart.length, isAdmin, hasOnRequestService]);

  // Final values: admin uses custom only for on-request services, others use calculated
  const finalPrice = isAdmin && hasOnRequestService && customPrice ? Number(customPrice) : totalPrice;
  const finalDuration = isAdmin && hasOnRequestService && customDuration ? Number(customDuration) : totalDuration;

  const cartDetails = useMemo(() => 
    cart.map(i => ({ ...i, treatment: treatments?.find(x => x.id === i.treatmentId) })).filter(i => i.treatment), 
    [cart, treatments]
  );
  
  const addToCart = (id: string) => setCart(p => { 
    const e = p.find(x => x.treatmentId === id); 
    return e ? p.map(x => x.treatmentId === id ? { ...x, quantity: x.quantity + 1 } : x) : [...p, { treatmentId: id, quantity: 1 }]; 
  });
  
  const incrementCart = (id: string) => setCart(p => p.map(x => x.treatmentId === id ? { ...x, quantity: x.quantity + 1 } : x));
  
  const decrementCart = (id: string) => setCart(p => { 
    const e = p.find(x => x.treatmentId === id); 
    return e && e.quantity <= 1 ? p.filter(x => x.treatmentId !== id) : p.map(x => x.treatmentId === id ? { ...x, quantity: x.quantity - 1 } : x); 
  });

  const getCartQuantity = (treatmentId: string) => {
    return cart.find(x => x.treatmentId === treatmentId)?.quantity || 0;
  };

  const flatIds = useMemo(() => { 
    const ids: string[] = []; 
    cart.forEach(i => { 
      for (let j = 0; j < i.quantity; j++) ids.push(i.treatmentId); 
    }); 
    return ids; 
  }, [cart]);

  const mutation = useMutation({
    mutationFn: async (d: any) => {
      const hotel = hotels?.find(h => h.id === d.hotelId);
      const hd = hairdressers?.find(h => h.id === d.hairdresserId);

      // Pour les concierges, auto-assigner le premier coiffeur de l'hôtel (alphabétiquement)
      let autoAssignedHairdresser: { id: string; first_name: string; last_name: string } | null = null;
      if (!d.isAdmin && d.hotelId) {
        const { data: hairdresserHotels } = await supabase
          .from("hairdresser_hotels")
          .select("hairdresser_id, hairdressers (id, first_name, last_name, status)")
          .eq("hotel_id", d.hotelId);

        const activeHairdressers = hairdresserHotels
          ?.map((hh: any) => hh.hairdressers)
          .filter((h: any) => h && ["Actif", "active", "Active"].includes(h.status))
          .sort((a: any, b: any) => a.first_name.localeCompare(b.first_name));

        if (activeHairdressers && activeHairdressers.length > 0) {
          autoAssignedHairdresser = activeHairdressers[0];
        }
      }

      // Determine status based on role:
      // - Admin with hairdresser assigned: "confirmed"
      // - Admin without hairdresser: "pending" (hairdressers notified)
      // - Concierge with auto-assigned hairdresser: "pending" (hairdresser can accept/decline)
      // - Concierge without hairdresser available: "pending_quote" (waiting for admin review)
      let status: string;
      let finalHairdresserId = d.hairdresserId || null;
      let finalHairdresserName = hd ? `${hd.first_name} ${hd.last_name}` : null;

      if (d.isAdmin) {
        status = d.hairdresserId ? "confirmed" : "pending";
      } else if (autoAssignedHairdresser) {
        // Concierge avec auto-assignation
        status = "pending";
        finalHairdresserId = autoAssignedHairdresser.id;
        finalHairdresserName = `${autoAssignedHairdresser.first_name} ${autoAssignedHairdresser.last_name}`;
      } else {
        // Concierge sans coiffeur disponible
        status = "pending_quote";
      }
      
      // Auto-assign trunk from hotel
      let trunkId: string | null = null;
      const { data: trunks } = await supabase
        .from("trunks")
        .select("id")
        .eq("hotel_id", d.hotelId)
        .eq("status", "active");
      
      if (trunks && trunks.length > 0) {
        // Get bookings at this time slot that have trunks assigned
        const { data: bookingsWithTrunks } = await supabase
          .from("bookings")
          .select("trunk_id")
          .eq("hotel_id", d.hotelId)
          .eq("booking_date", d.date)
          .eq("booking_time", d.time)
          .not("trunk_id", "is", null)
          .not("status", "in", '("Annulé","Terminé","cancelled")');
        
        const usedTrunkIds = new Set(bookingsWithTrunks?.map(b => b.trunk_id) || []);
        
        // Find first available trunk
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
      
      try {
        if (d.isAdmin) {
          // Admin flow: notify hairdressers immediately (if not already assigned)
          if (!d.hairdresserId) {
            await invokeEdgeFunction('trigger-new-booking-notifications', { body: { bookingId: booking.id } });
          }
        } else if (autoAssignedHairdresser) {
          // Concierge avec auto-assignation: notifier le coiffeur assigné
          await invokeEdgeFunction('trigger-new-booking-notifications', { body: { bookingId: booking.id } });
        } else {
          // Concierge sans coiffeur: notify admin for quote review
          await invokeEdgeFunction('notify-admin-new-booking', { body: { bookingId: booking.id } });
        }
      } catch {}
      
      return booking;
    },
    onSuccess: (data, variables) => {
      const message = variables.isAdmin
        ? "Réservation créée"
        : "Demande de devis envoyée";
      toast({ title: message });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });

      // Transition to step 3 for payment link
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
    onError: () => { 
      toast({ title: "Erreur", variant: "destructive" }); 
    },
  });

  const validateInfo = async () => {
    const result = await form.trigger([
      "hotelId", "clientFirstName", "clientLastName", "phone", "date", "time",
    ]);
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
      treatmentIds: flatIds,
      totalPrice: finalPrice,
      totalDuration: finalDuration,
      isAdmin
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
      clientFirstName: "",
      clientLastName: "",
      phone: "",
      countryCode: "+33",
      roomNumber: "",
    });
    setCart([]);
    setTreatmentFilter("female");
    setCustomPrice("");
    setCustomDuration("");
    setCreatedBooking(null);
    onOpenChange(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleRequestClose(); }}>
      <DialogContent className="max-w-xl max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden" onPointerDownOutside={(e) => { if (hasUnsavedChanges()) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (hasUnsavedChanges()) e.preventDefault(); }}>
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
              <TabsContent value="info" className="flex-1 px-4 py-4 space-y-3 mt-0 data-[state=inactive]:hidden">
                <div className={cn("grid gap-2", isAdmin ? "grid-cols-2" : "grid-cols-1")}>
                  <FormField
                    control={form.control}
                    name="hotelId"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Hôtel *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Sélectionner un hôtel" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(isConcierge && hotelIds.length > 0
                              ? hotels?.filter(hotel => hotelIds.includes(hotel.id))
                              : hotels
                            )?.map((hotel) => (
                              <SelectItem key={hotel.id} value={hotel.id}>
                                {hotel.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  {isAdmin && (
                    <FormField
                      control={form.control}
                      name="hairdresserId"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-xs">Coiffeur / Prestataire</FormLabel>
                          <Select
                            value={field.value || "none"}
                            onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                          >
                            <FormControl>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Sélectionner un coiffeur" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-background border shadow-lg">
                              <SelectItem value="none">Aucun coiffeur</SelectItem>
                              {hairdressers?.map((hairdresser) => (
                                <SelectItem key={hairdresser.id} value={hairdresser.id}>
                                  {hairdresser.first_name} {hairdresser.last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Date *</FormLabel>
                        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full h-9 justify-start text-left font-normal hover:bg-background hover:text-foreground",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "dd/MM/yyyy", { locale: fr }) : <span>Sélectionner</span>}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(selectedDate) => {
                                field.onChange(selectedDate);
                                setCalendarOpen(false);
                              }}
                              initialFocus
                              className="pointer-events-auto"
                              locale={fr}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="time"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Heure *</FormLabel>
                        <div className="flex gap-1 items-center">
                          <Popover open={hourOpen} onOpenChange={setHourOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
                                {field.value.split(':')[0] || "HH"}
                                <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start" onWheelCapture={(e) => e.stopPropagation()} onTouchMoveCapture={(e) => e.stopPropagation()}>
                              <ScrollArea className="h-40 touch-pan-y">
                                <div>
                                  {Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, '0')).map(h => (
                                    <button
                                      key={h}
                                      type="button"
                                      onClick={() => {
                                        field.onChange(`${h}:${field.value.split(':')[1] || '00'}`);
                                        setHourOpen(false);
                                      }}
                                      className={cn(
                                        "w-full px-3 py-1.5 text-sm text-center",
                                        field.value.split(':')[0] === h && "bg-muted"
                                      )}
                                    >
                                      {h}
                                    </button>
                                  ))}
                                </div>
                              </ScrollArea>
                            </PopoverContent>
                          </Popover>
                          <span className="flex items-center text-muted-foreground">:</span>
                          <Popover open={minuteOpen} onOpenChange={setMinuteOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
                                {field.value.split(':')[1] || "MM"}
                                <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start" onWheelCapture={(e) => e.stopPropagation()} onTouchMoveCapture={(e) => e.stopPropagation()}>
                              <ScrollArea className="h-40 touch-pan-y">
                                <div>
                                  {['00', '10', '20', '30', '40', '50'].map(m => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => {
                                        field.onChange(`${field.value.split(':')[0] || '09'}:${m}`);
                                        setMinuteOpen(false);
                                      }}
                                      className={cn(
                                        "w-full px-3 py-1.5 text-sm text-center",
                                        field.value.split(':')[1] === m && "bg-muted"
                                      )}
                                    >
                                      {m}
                                    </button>
                                  ))}
                                </div>
                              </ScrollArea>
                            </PopoverContent>
                          </Popover>
                          {hotelId && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                              <Globe className="h-3 w-3 shrink-0" />
                              {getCurrentOffset(hotelTimezone)}
                            </span>
                          )}
                        </div>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="clientFirstName"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Prénom *</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-9" />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="clientLastName"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Nom *</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-9" />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Phone number *</FormLabel>
                        <FormControl>
                          <PhoneNumberField
                            value={field.value}
                            onChange={(val) => {
                              const formatted = formatPhoneNumber(val, countryCode);
                              field.onChange(formatted);
                            }}
                            countryCode={countryCode}
                            setCountryCode={(code) => form.setValue("countryCode", code)}
                            countries={countries}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="roomNumber"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Room number</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-9" placeholder="1002" />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Footer */}
                <div className="flex justify-between gap-3 pt-4 mt-4 border-t shrink-0">
                  <Button type="button" variant="outline" onClick={handleClose}>
                    Annuler
                  </Button>
                  <Button type="button" onClick={async () => { if (await validateInfo()) setActiveTab("prestations"); }}>
                    Suivant
                  </Button>
                </div>
              </TabsContent>

            <TabsContent value="prestations" className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-4 pt-1 data-[state=inactive]:hidden max-h-[60vh]">
              {/* Menu Tabs */}
              <div className="flex items-center gap-4 border-b border-border/50 shrink-0 mb-3">
                {(["female", "male"] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTreatmentFilter(f)}
                    className={cn(
                      "pb-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors",
                      treatmentFilter === f 
                        ? "text-foreground border-b-2 border-foreground" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f === "female" ? "WOMEN'S MENU" : "MEN'S MENU"}
                  </button>
                ))}
              </div>

              {/* SERVICE LIST - Scrollable with max height */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {(() => {
                  const filtered = treatments?.filter(t => 
                    treatmentFilter === "female" 
                      ? (t.service_for === "Female" || t.service_for === "All")
                      : (t.service_for === "Male" || t.service_for === "All")
                  ) || [];
                  
                  const grouped: Record<string, typeof filtered> = {};
                  filtered.forEach(t => {
                    const c = t.category || "Autres";
                    if (!grouped[c]) grouped[c] = [];
                    grouped[c].push(t);
                  });

                  if (!filtered.length) {
                    return (
                      <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">
                        Aucune prestation disponible
                      </div>
                    );
                  }

                  return Object.entries(grouped).map(([category, items]) => (
                    <div key={category} className="mb-2">
                      <h3 className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 pb-0.5 border-b border-border/30">
                        {category}
                      </h3>
                      
                      <div>
                        {items.map((treatment) => {
                          const qty = getCartQuantity(treatment.id);
                          return (
                            <div 
                              key={treatment.id} 
                              className="flex items-center justify-between py-1.5 border-b border-border/10 last:border-0"
                            >
                              <div className="flex flex-col flex-1 pr-2 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-foreground text-xs truncate">
                                    {treatment.name}
                                  </span>
                                  {treatment.price_on_request && (
                                    <span className="shrink-0 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                                      Sur demande
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  {treatment.price_on_request 
                                    ? `${treatment.duration} min` 
                                    : `${formatPrice(treatment.price, selectedHotel?.currency || 'EUR', { decimals: 0 })} • ${treatment.duration} min`}
                                </span>
                              </div>

                              {qty > 0 ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => decrementCart(treatment.id)}
                                    className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors"
                                  >
                                    <Minus className="h-2.5 w-2.5" />
                                  </button>
                                  <span className="text-xs font-bold w-4 text-center">{qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => incrementCart(treatment.id)}
                                    className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors"
                                  >
                                    <Plus className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addToCart(treatment.id)}
                                  className="shrink-0 bg-foreground text-background text-[9px] font-medium uppercase tracking-wide h-5 px-2.5 rounded-full hover:bg-foreground/80 transition-colors"
                                >
                                  Ajouter
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
              
              {/* Compact Footer */}
              <div className="shrink-0 border-t border-border bg-background pt-3 mt-3 space-y-3">
                {/* Admin-only: Custom Price & Duration - ONLY for On Request services */}
                {isAdmin && hasOnRequestService && (
                  <div className="grid grid-cols-2 gap-2 pb-2 border-b border-border/50">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Prix personnalisé (€)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        className="h-7 text-xs"
                        placeholder={String(totalPrice)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Durée personnalisée (min)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="5"
                        value={customDuration}
                        onChange={(e) => setCustomDuration(e.target.value)}
                        className="h-7 text-xs"
                        placeholder={String(totalDuration)}
                      />
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between gap-3">
                  {/* Cart Summary */}
                  <div className="flex-1 min-w-0">
                    {cart.length > 0 ? (
                      <div className="flex items-center gap-1.5 overflow-x-auto">
                        {cartDetails.slice(0, 3).map(({ treatmentId, quantity, treatment }) => (
                          <div key={treatmentId} className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 shrink-0">
                            <span className="text-[9px] font-medium truncate max-w-[60px]">{treatment!.name}</span>
                            <span className="text-[9px] font-bold">×{quantity}</span>
                          </div>
                        ))}
                        {cartDetails.length > 3 && (
                          <span className="text-[9px] text-muted-foreground shrink-0">+{cartDetails.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Aucun service</span>
                    )}
                  </div>

                  {/* Total + Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-sm">{formatPrice(finalPrice, selectedHotel?.currency || 'EUR')}</span>
                    <Button 
                      type="button" 
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab("info")}
                      className="h-7 text-xs px-2"
                    >
                      ← Retour
                    </Button>
                    <Button
                      type="submit"
                      disabled={mutation.isPending || cart.length === 0}
                      size="sm"
                      className="bg-foreground text-background hover:bg-foreground/90 h-7 text-xs px-3"
                    >
                      {mutation.isPending ? "Création..." : isAdmin ? "Créer" : "Demander un devis"}
                      {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Step 3: Payment Link */}
            <TabsContent value="payment" className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-3 data-[state=inactive]:hidden">
              {createdBooking && (
                <div className="flex flex-col items-center justify-center flex-1 gap-6 py-6">
                  <div className="flex flex-col items-center gap-3">
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                    <h3 className="text-lg font-semibold">Réservation créée</h3>
                    <p className="text-sm text-muted-foreground text-center">
                      Réservation #{createdBooking.booking_id} pour {clientFirstName} {clientLastName}
                    </p>
                    <p className="text-sm font-medium">{formatPrice(finalPrice, selectedHotel?.currency || 'EUR')}</p>
                  </div>

                  <div className="flex flex-col gap-2 w-full max-w-xs">
                    <Button
                      type="button"
                      onClick={() => setIsPaymentLinkDialogOpen(true)}
                      className="bg-foreground text-background hover:bg-foreground/90"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Envoyer lien de paiement
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                    >
                      Fermer
                    </Button>
                  </div>
                </div>
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
