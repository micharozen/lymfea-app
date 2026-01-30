import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { format, parseISO, differenceInMinutes } from "date-fns";
import { fr } from "date-fns/locale";
import { X, CalendarIcon, ChevronDown, User, Plus, Minus, AlertTriangle, Globe, Loader2, Send } from "lucide-react";
import { cn, decodeHtmlEntities } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { getCurrentOffset } from "@/lib/timezones";
import { Badge } from "@/components/ui/badge";
import { getBookingStatusConfig, getPaymentStatusConfig } from "@/utils/statusStyles";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";

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

interface Booking {
  id: string;
  booking_id: number;
  hotel_id: string;
  hotel_name: string | null;
  client_first_name: string;
  client_last_name: string;
  phone: string;
  room_number: string | null;
  booking_date: string;
  booking_time: string;
  status: string;
  hairdresser_id: string | null;
  hairdresser_name: string | null;
  assigned_at: string | null;
  total_price?: number | null;
  duration?: number | null;
  payment_status?: string | null;
  payment_method?: string | null;
  client_signature?: string | null;
  stripe_invoice_url?: string | null;
  signed_at?: string | null;
  client_note?: string | null;
}


interface EditBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null;
}

export default function EditBookingDialog({
  open,
  onOpenChange,
  booking,
}: EditBookingDialogProps) {
  const queryClient = useQueryClient();
  const [hotelId, setHotelId] = useState("");
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+33");
  const [roomNumber, setRoomNumber] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("");
  const [status, setStatus] = useState("En attente");
  const [hairdresserId, setHairdresserId] = useState("");
  const [cart, setCart] = useState<{ treatmentId: string; quantity: number }[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [activeTab, setActiveTab] = useState("info");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [viewMode, setViewMode] = useState<"view" | "edit" | "quote">("view");
  const [showAssignHairdresser, setShowAssignHairdresser] = useState(false);
  const [selectedHairdresserId, setSelectedHairdresserId] = useState("");
  const [treatmentFilter, setTreatmentFilter] = useState<"female" | "male">("female");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [hourOpen, setHourOpen] = useState(false);
  const [minuteOpen, setMinuteOpen] = useState(false);
  
  // Quote pending states
  const [quotePrice, setQuotePrice] = useState<string>("");
  const [quoteDuration, setQuoteDuration] = useState<string>("");

  // Payment link dialog state
  const [isPaymentLinkDialogOpen, setIsPaymentLinkDialogOpen] = useState(false);
  

  // Pre-fill form when booking changes
  useEffect(() => {
    if (booking) {
      setViewMode("view"); // Reset to view mode when opening
      setHotelId(booking.hotel_id);
      setClientFirstName(booking.client_first_name);
      setClientLastName(booking.client_last_name);
      
      // Extract country code and phone number from stored phone
      const phoneMatch = booking.phone.match(/^(\+\d+)\s+(.+)$/);
      if (phoneMatch) {
        setCountryCode(phoneMatch[1]);
        setPhone(phoneMatch[2]);
      } else {
        setPhone(booking.phone);
      }
      
      setRoomNumber(booking.room_number || "");
      setDate(booking.booking_date ? new Date(booking.booking_date) : undefined);
      setTime(booking.booking_time);
      setStatus(booking.status);
      setHairdresserId(booking.hairdresser_id || "");
    }
  }, [booking]);

  const { data: userRole } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      
      if (error) throw error;
      return data?.role;
    },
  });

  const isAdmin = userRole === "admin";
  const isConcierge = userRole === "concierge";
  const canCancelBooking = isAdmin || isConcierge;

  // Calculate if booking is within 2 hours (late cancellation)
  const isLateCancellation = useMemo(() => {
    if (!booking?.booking_date || !booking?.booking_time) return false;
    
    const now = new Date();
    const bookingDateTime = parseISO(`${booking.booking_date}T${booking.booking_time}`);
    const minutesUntilAppointment = differenceInMinutes(bookingDateTime, now);
    const hoursUntilAppointment = minutesUntilAppointment / 60;
    
    return hoursUntilAppointment <= 2 && hoursUntilAppointment > 0;
  }, [booking?.booking_date, booking?.booking_time]);

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, timezone, currency")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedHotel = useMemo(() => hotels?.find(h => h.id === hotelId), [hotels, hotelId]);
  const hotelTimezone = selectedHotel?.timezone || "Europe/Paris";

  const { data: hairdressers } = useQuery({
    queryKey: ["hairdressers", booking?.hotel_id],
    enabled: !!booking?.hotel_id,
    queryFn: async () => {
      // Récupérer les coiffeurs assignés à l'hôtel de cette réservation
      const { data, error } = await supabase
        .from("hairdresser_hotels")
        .select(`
          hairdresser_id,
          hairdressers (
            id,
            first_name,
            last_name,
            status
          )
        `)
        .eq("hotel_id", booking!.hotel_id);

      if (error) throw error;
      
      // Filtrer pour ne garder que les coiffeurs actifs
      return data
        ?.map((hh: any) => hh.hairdressers)
        .filter((h: any) => h && h.status === "active")
        .sort((a: any, b: any) => a.first_name.localeCompare(b.first_name)) || [];
    },
  });

  // Query to get hairdresser availability for the selected date/time
  const { data: hairdresserAvailability } = useQuery({
    queryKey: ["hairdresser-availability", booking?.hotel_id, date, time, cart, booking?.id],
    enabled: !!booking?.hotel_id && !!date && !!time && viewMode === "edit",
    queryFn: async () => {
      if (!date || !time) return {};
      
      const selectedDate = format(date, "yyyy-MM-dd");
      
      // Calculate total duration of selected treatments
      const calcDuration = cart.reduce((sum, item) => {
        const treatment = treatments?.find(t => t.id === item.treatmentId);
        return sum + (treatment?.duration || 0) * item.quantity;
      }, 0) || 60; // Default 60 min if no treatments selected
      
      // Calculate start and end time in minutes
      const [hours, minutes] = time.split(':').map(Number);
      const startTime = hours * 60 + minutes;
      const endTime = startTime + calcDuration;
      
      // Fetch all bookings for the hotel on this date (excluding current booking)
      const { data: existingBookings, error } = await supabase
        .from("bookings")
        .select(`
          id,
          hairdresser_id,
          booking_time,
          booking_treatments (
            treatment_menus (
              duration
            )
          )
        `)
        .eq("booking_date", selectedDate)
        .neq("id", booking!.id)
        .not("hairdresser_id", "is", null);
      
      if (error) {
        console.error("Error fetching availability:", error);
        return {};
      }
      
      // Build availability map
      const availability: Record<string, { available: boolean; conflict?: string }> = {};
      
      // Initialize all hairdressers as available
      hairdressers?.forEach(h => {
        availability[h.id] = { available: true };
      });
      
      // Check each existing booking for conflicts
      existingBookings?.forEach((existingBooking) => {
        if (!existingBooking.hairdresser_id) return;
        
        const [existingHours, existingMinutes] = existingBooking.booking_time.split(':').map(Number);
        const existingStartTime = existingHours * 60 + existingMinutes;
        
        const existingDuration = (existingBooking.booking_treatments as any[]).reduce((sum, bt) => {
          return sum + (bt.treatment_menus?.duration || 0);
        }, 0) || 60;
        const existingEndTime = existingStartTime + existingDuration;
        
        // Check for overlap
        const hasOverlap = 
          (startTime >= existingStartTime && startTime < existingEndTime) ||
          (endTime > existingStartTime && endTime <= existingEndTime) ||
          (startTime <= existingStartTime && endTime >= existingEndTime);
        
        if (hasOverlap && availability[existingBooking.hairdresser_id]) {
          const conflictTime = `${String(Math.floor(existingStartTime / 60)).padStart(2, '0')}:${String(existingStartTime % 60).padStart(2, '0')}-${String(Math.floor(existingEndTime / 60)).padStart(2, '0')}:${String(existingEndTime % 60).padStart(2, '0')}`;
          availability[existingBooking.hairdresser_id] = { 
            available: false, 
            conflict: conflictTime 
          };
        }
      });
      
      return availability;
    },
  });

  const { data: treatments } = useQuery({
    queryKey: ["treatment_menus", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("*")
        .eq("status", "active")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: existingTreatments } = useQuery({
    queryKey: ["booking_treatments", booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_treatments")
        .select("treatment_id")
        .eq("booking_id", booking!.id);
      if (error) throw error;
      return data;
    },
  });

  const { data: bookingTreatments } = useQuery({
    queryKey: ["booking_treatments_details", booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_treatments")
        .select(`
          treatment_id,
          treatment_menus (
            id,
            name,
            category,
            price,
            duration,
            price_on_request
          )
        `)
        .eq("booking_id", booking!.id);
      if (error) throw error;
      return data?.map((bt: any) => bt.treatment_menus).filter(Boolean) || [];
    },
  });

  // Separate fixed and variable treatments for mixed cart logic
  const fixedTreatments = bookingTreatments?.filter((t: any) => !t.price_on_request) || [];
  const variableTreatments = bookingTreatments?.filter((t: any) => t.price_on_request) || [];
  const fixedTreatmentsTotal = fixedTreatments.reduce((sum: number, t: any) => sum + (t?.price || 0), 0);
  const hasVariableTreatments = variableTreatments.length > 0;

  // Charger les traitements existants quand la réservation change
  useEffect(() => {
    if (existingTreatments) {
      // Convert existing treatments to cart format (each treatment = quantity 1)
      const treatmentCounts: Record<string, number> = {};
      existingTreatments.forEach(t => {
        treatmentCounts[t.treatment_id] = (treatmentCounts[t.treatment_id] || 0) + 1;
      });
      setCart(Object.entries(treatmentCounts).map(([treatmentId, quantity]) => ({ treatmentId, quantity })));
    }
  }, [existingTreatments]);

  // Recalculer le prix et durée totale quand le cart change
  useEffect(() => {
    if (treatments && cart.length > 0) {
      let price = 0;
      let duration = 0;
      cart.forEach(item => {
        const treatment = treatments.find(t => t.id === item.treatmentId);
        if (treatment) {
          price += (treatment.price || 0) * item.quantity;
          duration += (treatment.duration || 0) * item.quantity;
        }
      });
      setTotalPrice(price);
      setTotalDuration(duration);
    } else {
      setTotalPrice(0);
      setTotalDuration(0);
    }
  }, [cart, treatments]);

  // Calculer le prix total depuis les traitements de la réservation pour la vue
  useEffect(() => {
    if (bookingTreatments && bookingTreatments.length > 0 && viewMode === "view") {
      const total = bookingTreatments.reduce((sum, treatment) => {
        return sum + (treatment?.price || 0);
      }, 0);
      setTotalPrice(total);
    }
  }, [bookingTreatments, viewMode]);

  const updateMutation = useMutation({
    mutationFn: async (bookingData: any) => {
      if (!booking?.id) return { wasAssigned: false };

      const hairdresser = hairdressers?.find((h) => h.id === bookingData.hairdresser_id);
      
      // Gestion du statut et de assigned_at
      let newStatus = bookingData.status;
      let assignedAt = booking.assigned_at;
      
      // Track if a hairdresser was newly assigned OR changed
      const wasAssigned = bookingData.hairdresser_id && !booking.hairdresser_id;
      const hairdresserChanged = bookingData.hairdresser_id && booking.hairdresser_id && 
                                  bookingData.hairdresser_id !== booking.hairdresser_id;
      // Track if booking was cancelled
      const wasCancelled = bookingData.status === "cancelled" && booking.status !== "cancelled";
      
      // Si on assigne un coiffeur pour la première fois (statut "En attente"), passer à "Assigné"
      if (bookingData.hairdresser_id && booking.status === "En attente") {
        newStatus = "Assigné";
        assignedAt = new Date().toISOString();
      }
      
      // Si on change de coiffeur (nouveau coiffeur différent de l'ancien), mettre à jour assigned_at
      if (bookingData.hairdresser_id && booking.hairdresser_id && 
          bookingData.hairdresser_id !== booking.hairdresser_id && 
          booking.status === "Assigné") {
        // Le statut reste "Assigné" mais on met à jour la date d'assignation
        assignedAt = new Date().toISOString();
      }
      
      // Si on retire le coiffeur d'une réservation "Assigné", remettre à "En attente"
      if (!bookingData.hairdresser_id && booking.status === "Assigné") {
        newStatus = "En attente";
        assignedAt = null;
      }

      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          hotel_id: bookingData.hotel_id,
          client_first_name: bookingData.client_first_name,
          client_last_name: bookingData.client_last_name,
          phone: bookingData.phone,
          room_number: bookingData.room_number,
          booking_date: bookingData.booking_date,
          booking_time: bookingData.booking_time,
          hairdresser_id: bookingData.hairdresser_id || null,
          hairdresser_name: bookingData.hairdresser_id && hairdresser ? `${hairdresser.first_name} ${hairdresser.last_name}` : null,
          total_price: bookingData.total_price,
          status: newStatus,
          assigned_at: assignedAt,
        })
        .eq("id", booking.id);

      if (bookingError) throw bookingError;

      const { error: deleteTreatmentsError } = await supabase
        .from("booking_treatments")
        .delete()
        .eq("booking_id", booking.id);

      if (deleteTreatmentsError) throw deleteTreatmentsError;

      if (bookingData.treatments && bookingData.treatments.length > 0) {
        const treatmentInserts = bookingData.treatments.map((treatmentId: string) => ({
          booking_id: booking.id,
          treatment_id: treatmentId,
        }));

        const { error: treatmentsError } = await supabase
          .from("booking_treatments")
          .insert(treatmentInserts);

        if (treatmentsError) throw treatmentsError;
      }
      
      return { wasAssigned, hairdresserChanged, wasCancelled };
    },
    onSuccess: async (result) => {
      console.log("Update success - wasAssigned:", result?.wasAssigned, "hairdresserChanged:", result?.hairdresserChanged, "wasCancelled:", result?.wasCancelled, "bookingId:", booking?.id);
      
      // Send push notification if hairdresser was newly assigned OR changed
      if ((result?.wasAssigned || result?.hairdresserChanged) && booking?.id) {
        console.log("Triggering push notification for booking:", booking.id);
        try {
          const { data, error } = await invokeEdgeFunction('trigger-new-booking-notifications', {
            body: { bookingId: booking.id }
          });
          console.log("Push notification result:", data, error);
        } catch (notifError) {
          console.error("Error sending push notification:", notifError);
        }
      }

      // Send push notification if booking was cancelled
      if (result?.wasCancelled && booking?.id) {
        console.log("Triggering cancellation push notification for booking:", booking.id);
        try {
          const { data, error } = await invokeEdgeFunction('trigger-booking-cancelled-notification', {
            body: { bookingId: booking.id }
          });
          console.log("Cancellation push notification result:", data, error);
        } catch (notifError) {
          console.error("Error sending cancellation push notification:", notifError);
        }
      }
      
      // Invalidate and refetch queries, then close
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["booking_treatments", booking?.id] });
      await queryClient.invalidateQueries({ queryKey: ["booking_treatments_details", booking?.id] });
      
      // Wait a bit for data to propagate before closing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Build success message
      let description = "La réservation a été modifiée avec succès";
      if (result?.hairdresserChanged && hairdressers) {
        const newHairdresser = hairdressers.find(h => h.id === hairdresserId);
        if (newHairdresser) {
          description = `Réservation réassignée à ${newHairdresser.first_name} ${newHairdresser.last_name}`;
        }
      } else if (result?.wasAssigned && hairdressers) {
        const newHairdresser = hairdressers.find(h => h.id === hairdresserId);
        if (newHairdresser) {
          description = `Coiffeur ${newHairdresser.first_name} ${newHairdresser.last_name} assigné avec succès`;
        }
      }
      
      toast({
        title: "Succès",
        description,
      });
      // Fermer le dialog après modification
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la modification de la réservation",
        variant: "destructive",
      });
      console.error("Error updating booking:", error);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!booking?.id) return;

      const { error } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancellation_reason: reason,
        })
        .eq("id", booking.id);

      if (error) throw error;
    },
    onSuccess: async () => {
      // Call the backend cancellation handler directly (DB trigger is unreliable in this environment)
      if (booking?.id) {
        try {
          console.log("Calling handle-booking-cancellation for booking:", booking.id);
          const { data, error } = await invokeEdgeFunction(
            "handle-booking-cancellation",
            {
              body: {
                bookingId: booking.id,
                cancellationReason: cancellationReason || undefined,
              },
            }
          );

          if (error) {
            console.error("handle-booking-cancellation error:", error);
          } else {
            console.log("handle-booking-cancellation result:", data);
          }
        } catch (e) {
          console.error("handle-booking-cancellation exception:", e);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({
        title: "Succès",
        description: "La réservation a été annulée avec succès",
      });
      setShowDeleteDialog(false);
      setCancellationReason("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de l'annulation de la réservation",
        variant: "destructive",
      });
      console.error("Error cancelling booking:", error);
    },
  });

  // Quote validation mutation - sends to client for approval
  const validateQuoteMutation = useMutation({
    mutationFn: async ({ quotedVariablePrice, quotedVariableDuration }: { quotedVariablePrice: number; quotedVariableDuration: number }) => {
      if (!booking?.id) throw new Error("No booking ID");

      // Calculate totals: fixed items + quoted variable items
      const totalPrice = fixedTreatmentsTotal + quotedVariablePrice;
      const fixedDuration = fixedTreatments.reduce((sum: number, t: any) => sum + (t?.duration || 0), 0);
      const totalDuration = fixedDuration + quotedVariableDuration;

      // Update booking with total price, duration and set to waiting_approval
      const { error } = await supabase
        .from("bookings")
        .update({
          total_price: totalPrice,
          duration: totalDuration,
          status: "waiting_approval",
        })
        .eq("id", booking.id);

      if (error) throw error;

      // Prepare breakdown for email
      const fixedItemsBreakdown = fixedTreatments.map((t: any) => ({
        name: t.name,
        price: t.price || 0,
        isFixed: true,
      }));
      
      const variableItemsBreakdown = variableTreatments.map((t: any) => ({
        name: t.name,
        price: quotedVariablePrice / variableTreatments.length, // Split evenly for display
        isFixed: false,
      }));

      // Send quote email to client with breakdown
      const { error: emailError } = await invokeEdgeFunction('send-quote-email', {
        body: {
          bookingId: booking.id,
          quotedPrice: totalPrice,
          quotedDuration: totalDuration,
          fixedTotal: fixedTreatmentsTotal,
          variableTotal: quotedVariablePrice,
          fixedItems: fixedItemsBreakdown,
          variableItems: variableItemsBreakdown,
        }
      });

      if (emailError) {
        console.error("Error sending quote email:", emailError);
        throw new Error("Failed to send quote email");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      
      toast({
        title: "Devis envoyé !",
        description: "Le client va recevoir un email pour accepter ou refuser le devis.",
      });
      setQuotePrice("");
      setQuoteDuration("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de l'envoi du devis",
        variant: "destructive",
      });
      console.error("Error validating quote:", error);
    },
  });

  // Admin can directly approve a quote without needing the token
  const approveQuoteMutation = useMutation({
    mutationFn: async () => {
      if (!booking?.id) throw new Error("No booking ID");

      // Admin directly updates the booking status to pending
      const { error } = await supabase
        .from("bookings")
        .update({ 
          status: "pending", 
          quote_token: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", booking.id);

      if (error) throw error;

      // Trigger notifications for hairdressers
      await invokeEdgeFunction("trigger-new-booking-notifications", {
        body: { bookingId: booking.id },
      });

      return { success: true };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({
        title: "Devis accepté",
        description: "La réservation est maintenant en attente d'un coiffeur.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error?.message || "Impossible de valider le devis",
        variant: "destructive",
      });
    },
  });

  const handleValidateQuote = () => {
    const variablePrice = parseFloat(quotePrice);
    const variableDuration = parseInt(quoteDuration);
    
    if (isNaN(variablePrice) || variablePrice <= 0) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer un prix valide pour les soins sur devis",
        variant: "destructive",
      });
      return;
    }
    
    if (isNaN(variableDuration) || variableDuration <= 0) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer une durée valide pour les soins sur devis",
        variant: "destructive",
      });
      return;
    }
    
    validateQuoteMutation.mutate({ 
      quotedVariablePrice: variablePrice, 
      quotedVariableDuration: variableDuration 
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!hotelId || !clientFirstName || !clientLastName || !phone || !date || !time) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    // Vérifier les chevauchements SEULEMENT si on change le coiffeur ou l'heure
    const hairdresserChanged = hairdresserId !== booking?.hairdresser_id;
    const timeChanged = time !== booking?.booking_time;
    const dateChanged = date && format(date, "yyyy-MM-dd") !== booking?.booking_date;
    
    if (hairdresserId && cart.length > 0 && (hairdresserChanged || timeChanged || dateChanged)) {
      const calcDuration = cart.reduce((sum, item) => {
        const treatment = treatments?.find(t => t.id === item.treatmentId);
        return sum + (treatment?.duration || 0) * item.quantity;
      }, 0);

      // Calculer l'heure de fin
      const [hours, minutes] = time.split(':').map(Number);
      const startTime = hours * 60 + minutes;
      const endTime = startTime + calcDuration;

      // Vérifier les réservations existantes pour ce coiffeur
      const { data: existingBookings, error } = await supabase
        .from("bookings")
        .select(`
          id,
          booking_time,
          booking_date,
          booking_treatments (
            treatment_menus (
              duration
            )
          )
        `)
        .eq("hairdresser_id", hairdresserId)
        .eq("booking_date", format(date, "yyyy-MM-dd"))
        .neq("id", booking?.id); // Exclure la réservation actuelle

      if (error) {
        console.error("Error checking for overlaps:", error);
      } else if (existingBookings && existingBookings.length > 0) {
        // Vérifier chaque réservation existante
        for (const existingBooking of existingBookings) {
          const [existingHours, existingMinutes] = existingBooking.booking_time.split(':').map(Number);
          const existingStartTime = existingHours * 60 + existingMinutes;
          
          const existingDuration = (existingBooking.booking_treatments as any[]).reduce((sum, bt) => {
            return sum + (bt.treatment_menus?.duration || 0);
          }, 0) || 60; // Durée par défaut de 60 min si pas de traitements
          const existingEndTime = existingStartTime + existingDuration;

          // Vérifier le chevauchement
          if (
            (startTime >= existingStartTime && startTime < existingEndTime) ||
            (endTime > existingStartTime && endTime <= existingEndTime) ||
            (startTime <= existingStartTime && endTime >= existingEndTime)
          ) {
            toast({
              title: "Chevauchement détecté",
              description: `Ce coiffeur a déjà une réservation de ${String(Math.floor(existingStartTime / 60)).padStart(2, '0')}:${String(existingStartTime % 60).padStart(2, '0')} à ${String(Math.floor(existingEndTime / 60)).padStart(2, '0')}:${String(existingEndTime % 60).padStart(2, '0')}.`,
              variant: "destructive",
            });
            return;
          }
        }
      }
    }

    updateMutation.mutate({
      hotel_id: hotelId,
      client_first_name: clientFirstName,
      client_last_name: clientLastName,
      phone: `${countryCode} ${phone}`,
      room_number: roomNumber,
      booking_date: date ? format(date, "yyyy-MM-dd") : "",
      booking_time: time,
      hairdresser_id: hairdresserId,
      total_price: totalPrice,
      treatments: cart.flatMap(item => Array(item.quantity).fill(item.treatmentId)),
      status: status,
    });
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // Cart functions
  const addToCart = (treatmentId: string) => {
    setCart(prev => {
      const existing = prev.find(x => x.treatmentId === treatmentId);
      return existing 
        ? prev.map(x => x.treatmentId === treatmentId ? { ...x, quantity: x.quantity + 1 } : x)
        : [...prev, { treatmentId, quantity: 1 }];
    });
  };

  const incrementCart = (treatmentId: string) => {
    setCart(prev => prev.map(x => x.treatmentId === treatmentId ? { ...x, quantity: x.quantity + 1 } : x));
  };

  const decrementCart = (treatmentId: string) => {
    setCart(prev => {
      const existing = prev.find(x => x.treatmentId === treatmentId);
      return existing && existing.quantity <= 1
        ? prev.filter(x => x.treatmentId !== treatmentId)
        : prev.map(x => x.treatmentId === treatmentId ? { ...x, quantity: x.quantity - 1 } : x);
    });
  };

  const getCartQuantity = (treatmentId: string) => {
    return cart.find(x => x.treatmentId === treatmentId)?.quantity || 0;
  };

  const cartDetails = cart.map(item => ({
    ...item,
    treatment: treatments?.find(t => t.id === item.treatmentId)
  })).filter(item => item.treatment);

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) setViewMode("view");
    }}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-lg font-semibold">
            {viewMode === "view" ? "Détails de la réservation" : viewMode === "quote" ? "Valider le devis" : "Modifier la réservation"}
          </DialogTitle>
        </DialogHeader>

        {/* QUOTE VIEW */}
        {viewMode === "quote" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b">
                <div className="w-10 h-10 bg-orange-100 rounded flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Réservation #{booking?.booking_id}</p>
                  <p className="text-xs text-muted-foreground">{booking?.hotel_name}</p>
                </div>
              </div>

              {/* Prestations sur devis */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Prestations sur devis</p>
                {variableTreatments.map((treatment: any) => (
                  <div key={treatment.id} className="p-2 bg-orange-50 border border-orange-200 rounded text-sm">
                    {treatment.name}
                  </div>
                ))}
              </div>

              {/* Note du client */}
              {booking?.client_note && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-1 font-medium">Note du client</p>
                  <p className="text-sm text-foreground">{decodeHtmlEntities(booking.client_note)}</p>
                </div>
              )}

              {/* Form */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="quote-price-form" className="text-sm">Prix (€)</Label>
                  <Input
                    id="quote-price-form"
                    type="number"
                    min="0"
                    value={quotePrice}
                    onChange={(e) => setQuotePrice(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="quote-duration-form" className="text-sm">Durée (min)</Label>
                  <Input
                    id="quote-duration-form"
                    type="number"
                    min="0"
                    value={quoteDuration}
                    onChange={(e) => setQuoteDuration(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Actions - Fixed at bottom */}
            <div className="shrink-0 px-4 py-3 border-t bg-background flex justify-between gap-3">
              <Button variant="outline" onClick={() => setViewMode("view")}>
                Retour
              </Button>
              <Button
                onClick={handleValidateQuote}
                disabled={validateQuoteMutation.isPending || !quotePrice || !quoteDuration}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {validateQuoteMutation.isPending ? "Envoi..." : "Envoyer le devis"}
                {validateQuoteMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
            </div>
          </div>
        ) : viewMode === "view" ? (
          <>
            {/* BODY */}
            <div className="px-4 py-3 space-y-2">
              {/* En-tête */}
              <div className="flex items-center justify-between pb-3 border-b">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-muted rounded flex items-center justify-center shrink-0">
                    <CalendarIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">#{booking?.booking_id}</p>
                    <p className="text-xs text-muted-foreground">{booking?.hotel_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getBookingStatusConfig(booking?.status || 'pending').badgeClass}>
                    {getBookingStatusConfig(booking?.status || 'pending').label}
                  </Badge>
                  {booking?.payment_status && 
                   booking?.status !== 'quote_pending' && 
                   booking?.status !== 'waiting_approval' && (
                    <Badge variant="outline" className={`text-xs ${getPaymentStatusConfig(booking.payment_status).badgeClass}`}>
                      {getPaymentStatusConfig(booking.payment_status).label}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Infos principales */}
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="grid grid-cols-5 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Date</p>
                    <p className="font-medium text-sm">{booking?.booking_date && format(new Date(booking.booking_date), "dd-MM-yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Heure</p>
                    <p className="font-medium text-sm">{booking?.booking_time && booking.booking_time.substring(0, 5)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Chambre</p>
                    <p className="font-medium text-sm">{decodeHtmlEntities(booking?.room_number) || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Prix</p>
                    <p className="font-semibold text-sm">
                      {(() => {
                        const treatmentsPrice =
                          bookingTreatments && bookingTreatments.length > 0
                            ? bookingTreatments.reduce((sum, t) => sum + (t.price || 0), 0)
                            : 0;
                        const customPrice = booking?.total_price;
                        const value = customPrice && customPrice > 0 ? customPrice : treatmentsPrice;
                        return formatPrice(value, selectedHotel?.currency || 'EUR');
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Durée</p>
                    <p className="font-semibold text-sm">
                      {(() => {
                        const treatmentsDuration =
                          bookingTreatments && bookingTreatments.length > 0
                            ? bookingTreatments.reduce((total, t) => total + (t.duration || 0), 0)
                            : 0;
                        const customDuration = booking?.duration;
                        const value = customDuration && customDuration > 0 ? customDuration : treatmentsDuration || 60;
                        return `${value} min`;
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Prestations */}
              {bookingTreatments && bookingTreatments.length > 0 && (() => {
                const allOnQuote = bookingTreatments.every(
                  (t) => (!t.price || t.price === 0) && (!t.duration || t.duration === 0)
                );
                const treatmentsTotal = bookingTreatments.reduce((sum, t) => sum + (t?.price || 0), 0);
                const displayTotal = booking?.total_price && booking.total_price > 0 ? booking.total_price : treatmentsTotal;

                if (allOnQuote) {
                  return (
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-2">Prestations</p>
                      <div className="space-y-1.5">
                        {bookingTreatments.map((treatment) => (
                          <div key={treatment.id} className="flex items-center justify-between text-sm">
                            <span>{treatment.name}</span>
                            <span className="font-medium text-muted-foreground italic">Sur devis</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-sm pt-2 mt-2 border-t border-border/50">
                          <span className="font-semibold">Total</span>
                          <span className="font-semibold">{formatPrice(displayTotal, selectedHotel?.currency || 'EUR')}</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">Prestations</p>
                    <div className="space-y-1.5">
                      {bookingTreatments.map((treatment) => (
                        <div key={treatment.id} className="flex items-center justify-between text-sm">
                          <span>{treatment.name}</span>
                          <span className="font-medium">{formatPrice(treatment.price || 0, selectedHotel?.currency || 'EUR')}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-sm pt-2 mt-2 border-t border-border/50">
                        <span className="font-semibold">Total</span>
                        <span className="font-semibold">{formatPrice(displayTotal, selectedHotel?.currency || 'EUR')}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Coiffeur */}
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Coiffeur</p>
                {booking?.hairdresser_name ? (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="font-medium text-sm">{booking.hairdresser_name}</p>
                  </div>
                ) : isAdmin ? (
                  showAssignHairdresser ? (
                    <div className="space-y-2">
                      <Select value={selectedHairdresserId || "none"} onValueChange={setSelectedHairdresserId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Sélectionner un coiffeur" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Aucun coiffeur</SelectItem>
                          {hairdressers?.map((hairdresser) => (
                            <SelectItem key={hairdresser.id} value={hairdresser.id}>
                              {hairdresser.first_name} {hairdresser.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button 
                          size="sm"
                          onClick={async () => {
                            const hairdresserId = selectedHairdresserId === "none" ? null : selectedHairdresserId;
                            const hairdresser = hairdressers?.find(h => h.id === hairdresserId);
                            
                            let assignedAt = booking!.assigned_at;
                            
                            if (hairdresserId) {
                              assignedAt = new Date().toISOString();
                            } else {
                              assignedAt = null;
                            }
                            
                            const { error } = await supabase
                              .from("bookings")
                              .update({
                                hairdresser_id: hairdresserId,
                                hairdresser_name: hairdresser ? `${hairdresser.first_name} ${hairdresser.last_name}` : null,
                                assigned_at: assignedAt,
                              })
                              .eq("id", booking!.id);
                              
                            if (error) {
                              toast({ title: "Erreur", description: "Impossible d'assigner le coiffeur", variant: "destructive" });
                            } else {
                              const wasAssigned = hairdresserId && !booking!.hairdresser_id;
                              const hairdresserChanged = hairdresserId && booking!.hairdresser_id && hairdresserId !== booking!.hairdresser_id;
                              
                              if (wasAssigned || hairdresserChanged) {
                                try {
                                  await invokeEdgeFunction('trigger-new-booking-notifications', { body: { bookingId: booking!.id } });
                                } catch (e) { console.error(e); }
                              }
                              
                              toast({ title: "Succès", description: hairdresserId ? "Coiffeur assigné" : "Coiffeur retiré" });
                              await queryClient.invalidateQueries({ queryKey: ["bookings"] });
                              setShowAssignHairdresser(false);
                            }
                          }}
                          className="flex-1"
                        >
                          Confirmer
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => { setShowAssignHairdresser(false); setSelectedHairdresserId(booking?.hairdresser_id || ""); }}
                          className="flex-1"
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => { setShowAssignHairdresser(true); setSelectedHairdresserId(""); }}
                      className="h-8 text-xs"
                    >
                      Assigner un coiffeur
                    </Button>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun coiffeur assigné</p>
                )}
              </div>

              {/* Client */}
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Client</p>
                    <p className="font-medium text-sm">{booking?.client_first_name} {booking?.client_last_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Téléphone</p>
                    <p className="font-medium text-sm">{booking?.phone}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div className="px-4 py-3 border-t bg-muted/30 flex flex-row justify-between gap-3">
              {booking?.status === "quote_pending" && isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setViewMode("quote")}
                  className="border-orange-400 bg-orange-500 text-white hover:bg-orange-600 hover:text-white"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Valider le devis
                </Button>
              ) : booking?.status === "waiting_approval" && isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => approveQuoteMutation.mutate()}
                  disabled={approveQuoteMutation.isPending}
                >
                  {approveQuoteMutation.isPending ? "Validation..." : "Marquer accepté"}
                  {approveQuoteMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={handleClose}>
                  Fermer
                </Button>
              )}
              
              {!showAssignHairdresser && (
                <div className="flex gap-2">
                  {booking?.status !== "cancelled" && booking?.status !== "completed" && canCancelBooking && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setShowDeleteDialog(true)}
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                      Annuler
                    </Button>
                  )}
                  {booking?.payment_status !== 'paid' &&
                   booking?.payment_status !== 'charged_to_room' &&
                   booking?.payment_method === 'card' &&
                   booking?.status !== 'cancelled' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsPaymentLinkDialogOpen(true)}
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      Lien paiement
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => { setViewMode("edit"); setActiveTab("info"); }}
                  >
                    Modifier
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsContent value="info" className="flex-1 px-4 py-3 space-y-2 mt-0 data-[state=inactive]:hidden">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-hotel" className="text-xs">Hôtel *</Label>
                  <Select value={hotelId} onValueChange={setHotelId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sélectionner un hôtel" />
                    </SelectTrigger>
                    <SelectContent>
                      {hotels?.map((hotel) => (
                        <SelectItem key={hotel.id} value={hotel.id}>
                          {hotel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-hairdresser" className="text-xs">Coiffeur / Prestataire</Label>
                  <Select
                    value={hairdresserId || "none"}
                    onValueChange={(value) => {
                      const newValue = value === "none" ? "" : value;
                      setHairdresserId(newValue);
                    }}
                  >
                    <SelectTrigger id="edit-hairdresser" className="h-9">
                      <SelectValue placeholder="Sélectionner un coiffeur" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg">
                      <SelectItem value="none">Aucun coiffeur</SelectItem>
                      {/* Show current hairdresser if not in list */}
                      {booking?.hairdresser_id && booking?.hairdresser_name &&
                       !hairdressers?.find(h => h.id === booking.hairdresser_id) && (
                        <SelectItem value={booking.hairdresser_id}>
                          {booking.hairdresser_name} (Actuel)
                        </SelectItem>
                      )}
                      {hairdressers?.map((hairdresser) => {
                        const availability = hairdresserAvailability?.[hairdresser.id];
                        const isUnavailable = availability && !availability.available;
                        const isCurrentHairdresser = hairdresser.id === booking?.hairdresser_id;

                        return (
                          <SelectItem
                            key={hairdresser.id}
                            value={hairdresser.id}
                            disabled={isUnavailable && !isCurrentHairdresser}
                          >
                            {hairdresser.first_name} {hairdresser.last_name}
                            {isCurrentHairdresser && " (Actuel)"}
                            {isUnavailable && !isCurrentHairdresser && " - Occupé"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-[9px] leading-tight text-muted-foreground mt-0.5">
                    Seuls les coiffeurs disponibles pour ce créneau sont sélectionnables.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-date" className="text-xs">Date *</Label>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full h-9 justify-start text-left font-normal hover:bg-background hover:text-foreground",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "dd/MM/yyyy", { locale: fr }) : <span>Sélectionner</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(selectedDate) => {
                          setDate(selectedDate);
                          setCalendarOpen(false);
                        }}
                        initialFocus
                        className="pointer-events-auto"
                        locale={fr}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Heure *</Label>
                  <div className="flex gap-1 items-center">
                    <Popover open={hourOpen} onOpenChange={setHourOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
                          {time.split(':')[0] || "HH"}
                          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start" onWheelCapture={(e) => e.stopPropagation()} onTouchMoveCapture={(e) => e.stopPropagation()}>
                        <ScrollArea className="h-40 touch-pan-y">
                          <div>
                            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                              <button
                                key={h}
                                type="button"
                                onClick={() => {
                                  setTime(`${h}:${time.split(':')[1] || '00'}`);
                                  setHourOpen(false);
                                }}
                                className={cn(
                                  "w-full px-3 py-1.5 text-sm text-center",
                                  time.split(':')[0] === h && "bg-muted"
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
                          {time.split(':')[1] || "MM"}
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
                                  setTime(`${time.split(':')[0] || '09'}:${m}`);
                                  setMinuteOpen(false);
                                }}
                                className={cn(
                                  "w-full px-3 py-1.5 text-sm text-center",
                                  time.split(':')[1] === m && "bg-muted"
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
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-firstName" className="text-xs">Prénom *</Label>
                  <Input
                    id="edit-firstName"
                    value={clientFirstName}
                    onChange={(e) => setClientFirstName(e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-lastName" className="text-xs">Nom *</Label>
                  <Input
                    id="edit-lastName"
                    value={clientLastName}
                    onChange={(e) => setClientLastName(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Phone number *</Label>
                  <PhoneNumberField
                    value={phone}
                    onChange={(val) => {
                      const formatted = formatPhoneNumber(val, countryCode);
                      setPhone(formatted);
                    }}
                    countryCode={countryCode}
                    setCountryCode={setCountryCode}
                    countries={countries}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Room number</Label>
                  <Input
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="h-9"
                    placeholder="1002"
                  />
                </div>
              </div>

              {/* Footer fixé en bas de l'onglet info */}
              <div className="flex justify-between gap-3 pt-4 mt-4 border-t shrink-0">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setViewMode("view")}>
                    Annuler
                  </Button>
                  {booking?.status !== "cancelled" && booking?.status !== "completed" && canCancelBooking && (
                    <Button 
                      type="button" 
                      variant="destructive"
                      onClick={() => setShowDeleteDialog(true)}
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                      Annuler
                    </Button>
                  )}
                </div>
                <Button type="button" onClick={() => setActiveTab("prestations")}>
                  Suivant
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="prestations" className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-3 data-[state=inactive]:hidden max-h-[60vh]">
              {/* Menu Tabs */}
              <div className="flex items-center gap-4 border-b border-border/50 shrink-0 mb-2">
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
                                <span className="font-medium text-foreground text-xs truncate">
                                  {treatment.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {treatment.price}€ • {treatment.duration} min
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
              <div className="shrink-0 border-t border-border bg-background pt-2 mt-2">
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
                    <span className="font-bold text-sm">{totalPrice}€</span>
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
                      disabled={updateMutation.isPending}
                      size="sm"
                      className="bg-foreground text-background hover:bg-foreground/90 h-7 text-xs px-3"
                    >
                      {updateMutation.isPending ? "Modification..." : "Modifier"}
                      {updateMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </form>
        )}
      </DialogContent>

      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open);
        if (!open) setCancellationReason("");
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la réservation</AlertDialogTitle>
            <AlertDialogDescription>
              Veuillez indiquer la raison de l'annulation. Cette action ne supprimera pas la réservation mais changera son statut en "Annulé".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            {/* Late cancellation warning for concierges */}
            {isConcierge && isLateCancellation && (
              <Alert variant="destructive" className="bg-amber-50 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <strong>Attention :</strong> Cette réservation a lieu dans moins de 2h. 
                  Politique = Facturation 100%.
                </AlertDescription>
              </Alert>
            )}
            
            <div>
              <Label htmlFor="cancellation-reason" className="text-sm font-medium">
                Raison de l'annulation <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="cancellation-reason"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder={isConcierge && isLateCancellation 
                  ? "Ex: Geste commercial VIP, Client malade, Urgence familiale..."
                  : "Saisissez la raison de l'annulation..."}
                className="mt-2"
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMutation.mutate(cancellationReason)}
              disabled={!cancellationReason.trim() || cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending ? "Annulation..." : "Confirmer l'annulation"}
              {cancelMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {booking && (
        <SendPaymentLinkDialog
          open={isPaymentLinkDialogOpen}
          onOpenChange={setIsPaymentLinkDialogOpen}
          booking={{
            id: booking.id,
            booking_id: booking.booking_id,
            client_first_name: booking.client_first_name,
            client_last_name: booking.client_last_name,
            client_email: undefined,
            phone: booking.phone,
            room_number: booking.room_number || undefined,
            booking_date: booking.booking_date,
            booking_time: booking.booking_time,
            total_price: booking.total_price || 0,
            hotel_name: booking.hotel_name || undefined,
            treatments: bookingTreatments?.map(t => ({
              name: t.name || 'Service',
              price: t.price || 0,
            })) || [],
            currency: selectedHotel?.currency || 'EUR',
          }}
        />
      )}

    </Dialog>
  );
}
