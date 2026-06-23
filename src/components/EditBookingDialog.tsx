import { useState, useEffect, useMemo } from "react";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
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
import { useOrgScope } from "@/hooks/useOrgScope";
import { useAvailableRooms } from "@/hooks/booking/useAvailableRooms";
import {
  hotelKeys,
  treatmentKeys,
  listHotelsForOrg,
  listTreatmentMenusForOrg,
  listActiveTreatmentsForHotel,
} from "@shared/db";
import type { CartItem } from "@/components/booking/CreateBookingDialog.schema";
import {
  getCartLineDisplayName,
  getCartLineUnitPrice,
  getCartLineUnitDuration,
} from "@/lib/bookingCartLine";
import { computeOutOfHoursSurcharge } from "@/lib/surcharge";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { X, CalendarIcon, ChevronDown, User, Plus, Minus, AlertTriangle, Globe, Loader2, Send, Pencil, Search, DoorOpen } from "lucide-react";
import { cn, decodeHtmlEntities } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { getCurrentOffset } from "@/lib/timezones";
import { composePhoneNumber } from "@/lib/phone";
import { Badge } from "@/components/ui/badge";
import { getBookingStatusConfig, getPaymentStatusConfig } from "@/utils/statusStyles";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ButtonGroup } from "@/components/ui/button-group";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import { CancelBookingDialog } from "@/components/booking/CancelBookingDialog";
import { canCancelBookingByStatus } from "@/lib/cancelBookingRules";

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
  room_id?: string | null;
  room_name?: string | null;
  booking_date: string;
  booking_time: string;
  status: string;
  therapist_id: string | null;
  therapist_name: string | null;
  assigned_at: string | null;
  total_price?: number | null;
  duration?: number | null;
  payment_status?: string | null;
  payment_method?: string | null;
  client_signature?: string | null;
  stripe_invoice_url?: string | null;
  signed_at?: string | null;
  client_note?: string | null;
  guest_count?: number | null;
}

interface EditBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null;
  initialMode?: "view" | "edit" | "quote";
  onSuccess?: () => void;
}

export default function EditBookingDialog({
  open,
  onOpenChange,
  booking,
  initialMode = "view",
  onSuccess,
}: EditBookingDialogProps) {
  const queryClient = useQueryClient();
  const [hotelId, setHotelId] = useState("");
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+33");
  const [roomNumber, setRoomNumber] = useState("");
  const [clientNote, setClientNote] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("");
  const [status, setStatus] = useState("En attente");
  const [therapistId, setTherapistId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [activeTab, setActiveTab] = useState("info");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [viewMode, setViewMode] = useState<"view" | "edit" | "quote">("view");
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [therapistIds, setTherapistIds] = useState<string[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [hourOpen, setHourOpen] = useState(false);
  const [minuteOpen, setMinuteOpen] = useState(false);
  
  const [quotePrice, setQuotePrice] = useState<string>("");
  const [quoteDuration, setQuoteDuration] = useState<string>("");
  const [isPaymentLinkDialogOpen, setIsPaymentLinkDialogOpen] = useState(false);
  
  useEffect(() => {
    if (open && booking?.id) {
      queryClient.invalidateQueries({ queryKey: ["booking-therapists", booking.id] });
      queryClient.invalidateQueries({ queryKey: ["booking_treatments", booking.id] });
      queryClient.invalidateQueries({ queryKey: ["booking_treatments_details", booking.id] });
    }
  }, [open, booking?.id, queryClient]);

  useEffect(() => {
    if (booking && open) {
      setViewMode(initialMode);
      setTreatmentSearch("");
      setHotelId(booking.hotel_id || "");
      setClientFirstName(booking.client_first_name || "");
      setClientLastName(booking.client_last_name || "");
      
      const phoneStr = booking.phone || "";
      const phoneMatch = phoneStr.match(/^(\+\d+)\s+(.+)$/);
      if (phoneMatch) {
        setCountryCode(phoneMatch[1]);
        setPhone(phoneMatch[2]);
      } else {
        setPhone(phoneStr);
      }
      
      setRoomNumber(booking.room_number || "");
      setClientNote(booking.client_note || "");
      setDate(booking.booking_date ? new Date(booking.booking_date) : undefined);
      setTime(booking.booking_time || "");
      setStatus(booking.status || "En attente");
      setTherapistId(booking.therapist_id && booking.therapist_name ? booking.therapist_id : "");
      setRoomId(booking.room_id || "");

      const guestCount = booking.guest_count ?? 1;
      setTherapistIds(guestCount > 1 ? Array(guestCount).fill('') : []);
    }
  }, [booking, open, initialMode]);

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

  const { isVenueManagerView } = useEffectiveRole();
  const isAdmin = userRole === "admin" && !isVenueManagerView;
  const isConcierge = userRole === "concierge" || isVenueManagerView;
  const canCancelBooking =
    (isAdmin || isConcierge) && canCancelBookingByStatus(booking?.status);
  const isDuo = (booking?.guest_count ?? 1) > 1;
  const therapistCount = booking?.guest_count ?? 1;

  const SLOT_LOCKED_STATUSES = ["confirmed", "ongoing", "completed", "cancelled"];
  const TREATMENTS_LOCKED_STATUSES = ["ongoing", "completed", "cancelled"];
  const bookingStatus = booking?.status || "";
  const conciergeCanEditSlot = !isConcierge || !SLOT_LOCKED_STATUSES.includes(bookingStatus);
  const conciergeCanEditTreatments = !isConcierge || !TREATMENTS_LOCKED_STATUSES.includes(bookingStatus);
  const slotDisabled = !conciergeCanEditSlot;
  const clientFieldsDisabled = isConcierge;
  const treatmentsDisabled = !conciergeCanEditTreatments;

  const scope = useOrgScope();
  const { data: hotels } = useQuery({
    queryKey: hotelKeys.list(scope),
    enabled: !!scope,
    queryFn: () => listHotelsForOrg(supabase, scope!),
  });

  const selectedHotel = useMemo(() => hotels?.find(h => h.id === hotelId), [hotels, hotelId]);
  const hotelTimezone = selectedHotel?.timezone || "Europe/Paris";

  const queryHotelId = hotelId || booking?.hotel_id;

  // Salles de soin disponibles au créneau (la salle actuelle reste sélectionnable).
  const { rooms, occupiedRoomIds } = useAvailableRooms(
    queryHotelId,
    date ? format(date, "yyyy-MM-dd") : undefined,
    time,
    booking?.id,
  );

  const { data: therapists } = useQuery({
    queryKey: ["therapists", queryHotelId],
    enabled: !!queryHotelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("therapist_venues")
        .select(`
          therapist_id,
          therapists (
            id,
            first_name,
            last_name,
            status
          )
        `)
        .eq("hotel_id", queryHotelId!);

      if (error) throw error;
      
      return data
        ?.map((hh: any) => Array.isArray(hh.therapists) ? hh.therapists[0] : hh.therapists)
        .filter((h: any) => {
          if (!h) return false;
          const statut = h.status?.toLowerCase() || "";
          return statut === "active" || statut === "actif"; 
        })
        .sort((a: any, b: any) => a.first_name?.localeCompare(b.first_name)) || [];
    },
  });

  const { data: acceptedTherapists } = useQuery({
    queryKey: ["booking-therapists", booking?.id],
    enabled: !!booking?.id && (booking?.guest_count ?? 1) > 1,
    queryFn: async () => {
      const { data: btData } = await supabase
        .from("booking_therapists")
        .select("therapist_id, status")
        .eq("booking_id", booking!.id)
        .eq("status", "accepted");

      if (!btData || btData.length === 0) return [];

      const { data: therapistData } = await supabase
        .from("therapists")
        .select("id, first_name, last_name")
        .in("id", btData.map((bt) => bt.therapist_id));

      return btData.map((bt) => ({
        therapist_id: bt.therapist_id,
        therapists: therapistData?.find((t) => t.id === bt.therapist_id) ?? null,
      }));
    },
  });

  const { data: therapistAvailability } = useQuery({
    queryKey: ["therapist-availability", hotelId, date, time, cart, booking?.id],
    enabled: !!hotelId && !!date && !!time && viewMode === "edit",
    queryFn: async () => {
      if (!date || !time) return {};
      
      const selectedDate = format(date, "yyyy-MM-dd");
      
      const calcDuration = cart.reduce((sum, item) => {
        const treatment = treatments?.find(t => t.id === item.treatmentId);
        return sum + getCartLineUnitDuration(treatment, item.variantId) * item.quantity;
      }, 0) || 60;
      
      const [hours, minutes] = time.split(':').map(Number);
      const startTime = hours * 60 + minutes;
      const endTime = startTime + calcDuration;
      
      const { data: existingBookings, error } = await supabase
        .from("bookings")
        .select(`
          id,
          therapist_id,
          booking_time,
          booking_treatments (
            treatment_menus (
              duration
            )
          )
        `)
        .eq("booking_date", selectedDate)
        .neq("id", booking!.id)
        .not("therapist_id", "is", null);
      
      if (error) {
        console.error("Error fetching availability:", error);
        return {};
      }
      
      const availability: Record<string, { available: boolean; conflict?: string }> = {};
      
      therapists?.forEach(h => {
        availability[h.id] = { available: true };
      });
      
      existingBookings?.forEach((existingBooking) => {
        if (!existingBooking.therapist_id) return;
        
        const [existingHours, existingMinutes] = existingBooking.booking_time.split(':').map(Number);
        const existingStartTime = existingHours * 60 + existingMinutes;
        
        const existingDuration = (existingBooking.booking_treatments as any[]).reduce((sum, bt) => {
          return sum + (bt.treatment_menus?.duration || 0);
        }, 0) || 60;
        const existingEndTime = existingStartTime + existingDuration;
        
        const hasOverlap = 
          (startTime >= existingStartTime && startTime < existingEndTime) ||
          (endTime > existingStartTime && endTime <= existingEndTime) ||
          (startTime <= existingStartTime && endTime >= existingEndTime);
        
        if (hasOverlap && availability[existingBooking.therapist_id]) {
          const conflictTime = `${String(Math.floor(existingStartTime / 60)).padStart(2, '0')}:${String(existingStartTime % 60).padStart(2, '0')}-${String(Math.floor(existingEndTime / 60)).padStart(2, '0')}:${String(existingEndTime % 60).padStart(2, '0')}`;
          availability[existingBooking.therapist_id] = { 
            available: false, 
            conflict: conflictTime 
          };
        }
      });
      
      return availability;
    },
  });

  const { data: treatments } = useQuery({
    queryKey: hotelId ? treatmentKeys.forHotel(hotelId) : treatmentKeys.list(scope),
    enabled: hotelId ? true : !!scope,
    queryFn: () =>
      hotelId
        ? listActiveTreatmentsForHotel(supabase, hotelId)
        : listTreatmentMenusForOrg(supabase, scope!, { includeNullHotel: true }),
  });

  const { data: existingTreatments } = useQuery({
    queryKey: ["booking_treatments", booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_treatments")
        .select("treatment_id, variant_id")
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

  const fixedTreatments = bookingTreatments?.filter((t: any) => !t.price_on_request) || [];
  const variableTreatments = bookingTreatments?.filter((t: any) => t.price_on_request) || [];
  const fixedTreatmentsTotal = fixedTreatments.reduce((sum: number, t: any) => sum + (t?.price || 0), 0);

  useEffect(() => {
    if (existingTreatments) {
      const counts: Record<string, CartItem> = {};
      existingTreatments.forEach(t => {
        const variantId = t.variant_id ?? null;
        const key = `${t.treatment_id}|${variantId ?? ""}`;
        if (!counts[key]) counts[key] = { treatmentId: t.treatment_id, variantId, quantity: 0 };
        counts[key].quantity += 1;
      });
      setCart(Object.values(counts));
    }
  }, [existingTreatments]);

  useEffect(() => {
    if (treatments && cart.length > 0) {
      let price = 0;
      let duration = 0;
      cart.forEach(item => {
        const treatment = treatments.find(t => t.id === item.treatmentId);
        if (treatment) {
          price += getCartLineUnitPrice(treatment, item.variantId) * item.quantity;
          duration += getCartLineUnitDuration(treatment, item.variantId) * item.quantity;
        }
      });
      setTotalPrice(price);
      setTotalDuration(duration);
    } else {
      setTotalPrice(0);
      setTotalDuration(0);
    }
  }, [cart, treatments]);

  useEffect(() => {
    if ((booking?.guest_count ?? 1) > 1 && acceptedTherapists) {
      const n = booking?.guest_count ?? 2;
      setTherapistIds(
        Array.from({ length: n }, (_, i) => acceptedTherapists[i]?.therapist_id ?? '')
      );
    }
  }, [acceptedTherapists, booking?.guest_count, open]);

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

      const therapist = therapists?.find((h) => h.id === bookingData.therapist_id);

      let newStatus = bookingData.status;
      let assignedAt = booking.assigned_at;

      const wasAssigned = bookingData.therapist_id && !booking.therapist_id;
      const therapistChanged = bookingData.therapist_id && booking.therapist_id &&
                                  bookingData.therapist_id !== booking.therapist_id;

      if (bookingData.therapist_id && booking.status === "pending") {
        newStatus = "confirmed";
        assignedAt = new Date().toISOString();
      }

      if (bookingData.therapist_id && booking.therapist_id &&
          bookingData.therapist_id !== booking.therapist_id &&
          booking.status === "confirmed") {
        assignedAt = new Date().toISOString();
      }

      if (!bookingData.therapist_id && booking.status === "confirmed") {
        newStatus = "pending";
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
          room_id: bookingData.room_id ?? null,
          booking_date: bookingData.booking_date,
          booking_time: bookingData.booking_time,
          therapist_id: bookingData.therapist_id || null,
          therapist_name: bookingData.therapist_id && therapist ? `${therapist.first_name} ${therapist.last_name}` : null,
          total_price: bookingData.total_price,
          surcharge_amount: bookingData.surcharge_amount,
          is_out_of_hours: bookingData.is_out_of_hours,
          status: newStatus,
          assigned_at: assignedAt,
          client_note: bookingData.client_note ?? null,
        })
        .eq("id", booking.id);

      if (bookingError) throw bookingError;

      const { error: deleteTreatmentsError } = await supabase
        .from("booking_treatments")
        .delete()
        .eq("booking_id", booking.id);

      if (deleteTreatmentsError) throw deleteTreatmentsError;

      if (bookingData.treatments && bookingData.treatments.length > 0) {
        const treatmentInserts = bookingData.treatments.map(
          (t: { treatmentId: string; variantId?: string | null }) => ({
            booking_id: booking.id,
            treatment_id: t.treatmentId,
            variant_id: t.variantId ?? null,
          })
        );

        const { error: treatmentsError } = await supabase
          .from("booking_treatments")
          .insert(treatmentInserts);

        if (treatmentsError) throw treatmentsError;
      }

      if (bookingData.therapistIds) {
        const validIds: string[] = bookingData.therapistIds.filter(Boolean);
        const { error: btDeleteError } = await supabase.from("booking_therapists").delete().eq("booking_id", booking.id);
        if (btDeleteError) throw btDeleteError;
        if (validIds.length > 0) {
          const { error: btError } = await supabase.from("booking_therapists").insert(
            validIds.map((tid: string) => ({
              booking_id: booking.id,
              therapist_id: tid,
              status: 'accepted',
            }))
          );
          if (btError) throw btError;
        }
      }

      return { wasAssigned, therapistChanged };
    },
    onSuccess: async (result) => {
      if ((result?.wasAssigned || result?.therapistChanged) && booking?.id) {
        try {
          await invokeEdgeFunction('trigger-new-booking-notifications', {
            body: { bookingId: booking.id }
          });
        } catch (notifError) {
          console.error("Error sending push notification:", notifError);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["booking_treatments", booking?.id] });
      await queryClient.invalidateQueries({ queryKey: ["booking_treatments_details", booking?.id] });
      await queryClient.invalidateQueries({ queryKey: ["booking-therapists", booking?.id] });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      let description = "La réservation a été modifiée avec succès";
      if (isDuo && therapists) {
        const names = therapistIds
          .filter(Boolean)
          .map(id => therapists.find(h => h.id === id))
          .filter(Boolean)
          .map(h => `${h!.first_name} ${h!.last_name}`);
        if (names.length > 0) {
          description = `${names.length} thérapeute(s) assigné(s) : ${names.join(", ")}`;
        }
      } else if (result?.therapistChanged && therapists) {
        const newTherapist = therapists.find(h => h.id === therapistId);
        if (newTherapist) {
          description = `Réservation réassignée à ${newTherapist.first_name} ${newTherapist.last_name}`;
        }
      } else if (result?.wasAssigned && therapists) {
        const newTherapist = therapists.find(h => h.id === therapistId);
        if (newTherapist) {
          description = `Thérapeute ${newTherapist.first_name} ${newTherapist.last_name} assigné avec succès`;
        }
      }
      
      toast({
        title: "Succès",
        description,
      });
      onOpenChange(false);
      onSuccess?.();
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

  const validateQuoteMutation = useMutation({
    mutationFn: async ({ quotedVariablePrice, quotedVariableDuration }: { quotedVariablePrice: number; quotedVariableDuration: number }) => {
      if (!booking?.id) throw new Error("No booking ID");

      const totalPrice = fixedTreatmentsTotal + quotedVariablePrice;
      const fixedDuration = fixedTreatments.reduce((sum: number, t: any) => sum + (t?.duration || 0), 0);
      const totalDuration = fixedDuration + quotedVariableDuration;

      const { error } = await supabase
        .from("bookings")
        .update({
          total_price: totalPrice,
          duration: totalDuration,
          status: "waiting_approval",
        })
        .eq("id", booking.id);

      if (error) throw error;

      const fixedItemsBreakdown = fixedTreatments.map((t: any) => ({
        name: t.name,
        price: t.price || 0,
        isFixed: true,
      }));
      
      const variableItemsBreakdown = variableTreatments.map((t: any) => ({
        name: t.name,
        price: quotedVariablePrice / variableTreatments.length, 
        isFixed: false,
      }));

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
    },
  });

  const approveQuoteMutation = useMutation({
    mutationFn: async () => {
      if (!booking?.id) throw new Error("No booking ID");

      const { error } = await supabase
        .from("bookings")
        .update({ 
          status: "pending", 
          quote_token: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", booking.id);

      if (error) throw error;

      await invokeEdgeFunction("trigger-new-booking-notifications", {
        body: { bookingId: booking.id },
      });

      return { success: true };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({
        title: "Devis accepté",
        description: "La réservation est maintenant en attente d'un thérapeute.",
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
    
    if (!hotelId || !clientFirstName || !clientLastName || !date || !time) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    const therapistChanged = therapistId !== booking?.therapist_id;
    const timeChanged = time !== booking?.booking_time;
    const dateChanged = date && format(date, "yyyy-MM-dd") !== booking?.booking_date;

    if (isDuo) {
      const filledIds = therapistIds.filter(Boolean);
      const uniqueIds = new Set(filledIds);
      if (uniqueIds.size < filledIds.length) {
        toast({
          title: "Thérapeutes en double",
          description: "Le même thérapeute ne peut pas être assigné à deux rôles pour ce soin.",
          variant: "destructive",
        });
        return;
      }
    }

    if (!isDuo && therapistId && cart.length > 0 && (therapistChanged || timeChanged || dateChanged)) {
      const calcDuration = cart.reduce((sum, item) => {
        const treatment = treatments?.find(t => t.id === item.treatmentId);
        return sum + (treatment?.duration || 0) * item.quantity;
      }, 0);

      const [hours, minutes] = time.split(':').map(Number);
      const startTime = hours * 60 + minutes;
      const endTime = startTime + calcDuration;

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
        .eq("therapist_id", therapistId)
        .eq("booking_date", format(date, "yyyy-MM-dd"))
        .neq("id", booking?.id); 

      if (error) {
        console.error("Error checking for overlaps:", error);
      } else if (existingBookings && existingBookings.length > 0) {
        for (const existingBooking of existingBookings) {
          const [existingHours, existingMinutes] = existingBooking.booking_time.split(':').map(Number);
          const existingStartTime = existingHours * 60 + existingMinutes;
          
          const existingDuration = (existingBooking.booking_treatments as any[]).reduce((sum, bt) => {
            return sum + (bt.treatment_menus?.duration || 0);
          }, 0) || 60; 
          const existingEndTime = existingStartTime + existingDuration;

          if (
            (startTime >= existingStartTime && startTime < existingEndTime) ||
            (endTime > existingStartTime && endTime <= existingEndTime) ||
            (startTime <= existingStartTime && endTime >= existingEndTime)
          ) {
            toast({
              title: "Chevauchement détecté",
              description: `Ce thérapeute a déjà une réservation de ${String(Math.floor(existingStartTime / 60)).padStart(2, '0')}:${String(existingStartTime % 60).padStart(2, '0')} à ${String(Math.floor(existingEndTime / 60)).padStart(2, '0')}:${String(existingEndTime % 60).padStart(2, '0')}.`,
              variant: "destructive",
            });
            return;
          }
        }
      }
    }

    const submittedDate = isConcierge && !conciergeCanEditSlot
      ? (booking?.booking_date || "")
      : (date ? format(date, "yyyy-MM-dd") : "");
    const submittedTime = isConcierge && !conciergeCanEditSlot
      ? (booking?.booking_time || "")
      : time;
    const submittedTreatments = isConcierge && !conciergeCanEditTreatments
      ? (existingTreatments?.map(t => ({ treatmentId: t.treatment_id, variantId: t.variant_id ?? null })) || [])
      : cart.flatMap(item =>
          Array.from({ length: item.quantity }, () => ({
            treatmentId: item.treatmentId,
            variantId: item.variantId ?? null,
          }))
        );

    const primaryTherapistId = isConcierge
      ? (booking?.therapist_id || null)
      : isDuo
        ? (therapistIds.find(id => !!id) || null)
        : (therapistId === "none" ? null : therapistId);

    // Reconcile the out-of-hours surcharge against the (possibly edited) time and
    // subtotal. total_price stores the surcharge-inclusive amount; surcharge_amount
    // and is_out_of_hours are kept in sync so the Paiement card stays consistent.
    const surcharge = computeOutOfHoursSurcharge(submittedTime, totalPrice, selectedHotel);

    updateMutation.mutate({
      hotel_id: isConcierge ? (booking?.hotel_id || "") : hotelId,
      client_first_name: isConcierge ? (booking?.client_first_name || "") : clientFirstName,
      client_last_name: isConcierge ? (booking?.client_last_name || "") : clientLastName,
      phone: isConcierge ? (booking?.phone || null) : (composePhoneNumber(countryCode, phone) || null),
      room_number: isConcierge ? (booking?.room_number || "") : roomNumber,
      room_id: isConcierge ? (booking?.room_id ?? null) : (roomId || null),
      booking_date: submittedDate,
      booking_time: submittedTime,
      therapist_id: primaryTherapistId,
      total_price: surcharge.totalWithSurcharge,
      surcharge_amount: surcharge.surchargeAmount,
      is_out_of_hours: surcharge.isOutOfHours,
      treatments: submittedTreatments,
      status: status,
      client_note: isConcierge
        ? (booking?.client_note ?? null)
        : (clientNote.trim() ? clientNote.trim() : null),
      therapistIds: isDuo ? therapistIds : undefined,
    });
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // Variant-aware cart helpers (mirrors useBookingCart): each (treatmentId, variantId)
  // pair is a distinct line, so e.g. 1 Solo + 1 Duo of the same treatment can coexist.
  const addToCart = (treatmentId: string, variantId?: string | null) => {
    const treatment = treatments?.find(x => x.id === treatmentId);
    const resolvedVariantId = variantId !== undefined
      ? variantId
      : (treatment?.treatment_variants?.find(v => v.is_default)
          ?? treatment?.treatment_variants?.[0])?.id ?? null;

    setCart(prev => {
      const existing = prev.find(x => x.treatmentId === treatmentId && x.variantId === resolvedVariantId);
      if (existing) return prev.map(x =>
        x.treatmentId === treatmentId && x.variantId === resolvedVariantId
          ? { ...x, quantity: x.quantity + 1 }
          : x
      );
      return [...prev, { treatmentId, quantity: 1, variantId: resolvedVariantId }];
    });
  };

  const incrementCart = (treatmentId: string, variantId?: string | null) => {
    setCart(prev => {
      const target = variantId !== undefined
        ? prev.find(x => x.treatmentId === treatmentId && x.variantId === variantId)
        : prev.find(x => x.treatmentId === treatmentId);
      if (!target) return prev;
      return prev.map(x => x === target ? { ...x, quantity: x.quantity + 1 } : x);
    });
  };

  const decrementCart = (treatmentId: string, variantId?: string | null) => {
    setCart(prev => {
      const target = variantId !== undefined
        ? prev.find(x => x.treatmentId === treatmentId && x.variantId === variantId)
        : prev.find(x => x.treatmentId === treatmentId);
      if (!target) return prev;
      if (target.quantity <= 1) return prev.filter(x => x !== target);
      return prev.map(x => x === target ? { ...x, quantity: x.quantity - 1 } : x);
    });
  };

  // Without variantId: total across all variants of that treatment. With: that exact pair.
  const getCartQuantity = (treatmentId: string, variantId?: string | null) => {
    if (variantId !== undefined) {
      return cart.find(x => x.treatmentId === treatmentId && x.variantId === variantId)?.quantity || 0;
    }
    return cart.filter(x => x.treatmentId === treatmentId).reduce((sum, x) => sum + x.quantity, 0);
  };

  const cartDetails = cart.map(item => ({
    ...item,
    treatment: treatments?.find(t => t.id === item.treatmentId)
  })).filter(item => item.treatment);

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) setViewMode("view");
    }}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          {viewMode === "view" ? (
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-lg font-semibold">
                  Détails de la réservation
                </DialogTitle>
                <div className="flex items-center gap-2 mt-2">
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
              <ButtonGroup className="pr-10">
                {booking?.payment_status !== 'paid' &&
                 booking?.payment_status !== 'charged_to_room' &&
                 booking?.payment_method === 'card' &&
                 booking?.status !== 'cancelled' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setIsPaymentLinkDialogOpen(true)}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Lien paiement</TooltipContent>
                  </Tooltip>
                )}
                {booking?.status !== "cancelled" && booking?.status !== "completed" && canCancelBooking && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setShowCancelDialog(true)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Annuler</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => { setViewMode("edit"); setActiveTab("info"); }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Modifier</TooltipContent>
                </Tooltip>
              </ButtonGroup>
            </div>
          ) : (
            <DialogTitle className="text-lg font-semibold">
              {viewMode === "quote" ? "Valider le devis" : "Modifier la réservation"}
            </DialogTitle>
          )}
        </DialogHeader>

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

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Prestations sur devis</p>
                {variableTreatments.map((treatment: any) => (
                  <div key={treatment.id} className="p-2 bg-orange-50 border border-orange-200 rounded text-sm">
                    {treatment.name}
                  </div>
                ))}
              </div>

              {booking?.client_note && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-1 font-medium">Note du client</p>
                  <p className="text-sm text-foreground">{decodeHtmlEntities(booking.client_note)}</p>
                </div>
              )}

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
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-3 pb-3 border-b">
                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center shrink-0">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">#{booking?.booking_id}</p>
                  <p className="text-xs text-muted-foreground">{booking?.hotel_name}</p>
                </div>
              </div>

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

              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">
                    Thérapeute{(booking?.guest_count ?? 1) > 1 ? `s (${booking?.guest_count} requis)` : ""}
                  </p>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setViewMode("edit"); setActiveTab("info"); }}
                      className="h-6 text-[10px] px-2"
                    >
                      Assigner
                    </Button>
                  )}
                </div>
                {(booking?.guest_count ?? 1) > 1 && acceptedTherapists && acceptedTherapists.length > 0 ? (
                  <div className="space-y-1.5">
                    {acceptedTherapists.map((bt: any) => {
                      const t = Array.isArray(bt.therapists) ? bt.therapists[0] : bt.therapists;
                      return t ? (
                        <div key={bt.therapist_id} className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground shrink-0" />
                          <p className="font-medium text-sm">{t.first_name} {t.last_name}</p>
                        </div>
                      ) : null;
                    })}
                    {acceptedTherapists.length < (booking?.guest_count ?? 2) && (
                      <p className="text-xs text-violet-600 mt-1">
                        {acceptedTherapists.length}/{booking?.guest_count} thérapeutes ont accepté — en attente…
                      </p>
                    )}
                  </div>
                ) : booking?.therapist_name ? (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="font-medium text-sm">{booking.therapist_name}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun thérapeute assigné</p>
                )}
              </div>

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

              {booking?.client_note && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-1 font-medium">Note</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{decodeHtmlEntities(booking.client_note)}</p>
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t bg-muted/30 flex flex-row gap-3">
              {booking?.status === "quote_pending" && isAdmin ? (
                <Button
                  type="button"
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
                <div className="flex-1 flex justify-between">
                  <Button type="button" variant="default" onClick={() => { setViewMode("edit"); setActiveTab("info"); }}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Modifier la réservation
                  </Button>
                  <Button type="button" variant="outline" onClick={handleClose}>
                    Fermer
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsContent value="info" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden overflow-hidden">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {isConcierge && (
                <Alert className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {conciergeCanEditSlot
                      ? "En tant que membre de l'équipe lieu, vous pouvez modifier uniquement le créneau et les prestations."
                      : "Le créneau n'est plus modifiable (réservation confirmée par le thérapeute). Seules les prestations peuvent être ajustées."}
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-hotel" className="text-xs">Hôtel *</Label>
                  <Select value={hotelId} onValueChange={setHotelId} disabled={clientFieldsDisabled}>
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

                {!isDuo && (
                <div className="space-y-1">
                  <Label htmlFor="edit-therapist" className="text-xs">Thérapeute / Prestataire</Label>
                  <Select
                    value={therapistId || "none"}
                    onValueChange={(value) => {
                      const newValue = value === "none" ? "" : value;
                      setTherapistId(newValue);
                    }}
                    disabled={clientFieldsDisabled}
                  >
                    <SelectTrigger id="edit-therapist" className="h-9">
                      <SelectValue placeholder="Sélectionner un thérapeute" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg">
                      <SelectItem value="none">Aucun thérapeute</SelectItem>
                      {booking?.therapist_id && booking?.therapist_name &&
                       !therapists?.find(h => h.id === booking.therapist_id) && (
                        <SelectItem value={booking.therapist_id}>
                          {booking.therapist_name} (Actuel)
                        </SelectItem>
                      )}
                      {therapists?.map((therapist) => {
                        const availability = therapistAvailability?.[therapist.id];
                        const isUnavailable = availability && !availability.available;
                        const isCurrentTherapist = therapist.id === booking?.therapist_id && !!booking?.therapist_name;

                        return (
                          <SelectItem
                            key={therapist.id}
                            value={therapist.id}
                            disabled={isUnavailable && !isCurrentTherapist}
                          >
                            {therapist.first_name} {therapist.last_name}
                            {isCurrentTherapist && " (Actuel)"}
                            {isUnavailable && !isCurrentTherapist && " - Occupé"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-[9px] leading-tight text-muted-foreground mt-0.5">
                    Seuls les thérapeutes disponibles pour ce créneau sont sélectionnables.
                  </p>
                </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="edit-room" className="text-xs flex items-center gap-1.5">
                    <DoorOpen className="h-3.5 w-3.5" />
                    Salle de soin
                  </Label>
                  <Select
                    value={roomId || "__auto__"}
                    onValueChange={(value) => setRoomId(value === "__auto__" ? "" : value)}
                    disabled={clientFieldsDisabled}
                  >
                    <SelectTrigger id="edit-room" className="h-9">
                      <SelectValue placeholder="Automatique" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg">
                      <SelectItem value="__auto__">Automatique</SelectItem>
                      {roomId && !rooms.find((r) => r.id === roomId) && (
                        <SelectItem value={roomId}>
                          {booking?.room_name || "Salle actuelle"}
                        </SelectItem>
                      )}
                      {rooms.map((room) => {
                        const occupied = occupiedRoomIds.has(room.id) && room.id !== roomId;
                        return (
                          <SelectItem key={room.id} value={room.id} disabled={occupied}>
                            {room.name}
                            {occupied && " — Occupée"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isDuo && (
                <div className="space-y-1">
                  <Label className="text-xs">Thérapeutes ({therapistCount} requis)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: therapistCount }, (_, i) => (
                      <div key={i} className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">Thérapeute {i + 1}</p>
                        <Select
                          value={therapistIds[i] || "none"}
                          onValueChange={(val) => {
                            const newIds = [...therapistIds];
                            newIds[i] = val === "none" ? "" : val;
                            setTherapistIds(newIds);
                          }}
                          disabled={clientFieldsDisabled}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border shadow-lg">
                            <SelectItem value="none">Aucun thérapeute</SelectItem>
                            {therapists?.map((therapist) => {
                              const availability = therapistAvailability?.[therapist.id];
                              const isUnavailable = availability && !availability.available;
                              const isAlreadyPicked = therapistIds.some(
                                (id, j) => j !== i && id === therapist.id
                              );
                              const isCurrentForSlot = therapistIds[i] === therapist.id;
                              return (
                                <SelectItem
                                  key={therapist.id}
                                  value={therapist.id}
                                  disabled={(isUnavailable || isAlreadyPicked) && !isCurrentForSlot}
                                >
                                  {therapist.first_name} {therapist.last_name}
                                  {isAlreadyPicked && !isCurrentForSlot && " — déjà sélectionné"}
                                  {isUnavailable && !isAlreadyPicked && !isCurrentForSlot && " — Occupé"}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] leading-tight text-muted-foreground mt-0.5">
                    Sélectionnez un thérapeute par créneau du soin duo.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-date" className="text-xs">Date *</Label>
                  <Popover open={calendarOpen} onOpenChange={slotDisabled ? undefined : setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={slotDisabled}
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
                    <Popover open={hourOpen} onOpenChange={slotDisabled ? undefined : setHourOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" disabled={slotDisabled} className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
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
                    <Popover open={minuteOpen} onOpenChange={slotDisabled ? undefined : setMinuteOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" disabled={slotDisabled} className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
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
                    disabled={clientFieldsDisabled}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-lastName" className="text-xs">Nom *</Label>
                  <Input
                    id="edit-lastName"
                    value={clientLastName}
                    onChange={(e) => setClientLastName(e.target.value)}
                    disabled={clientFieldsDisabled}
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
                    disabled={clientFieldsDisabled}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Room number</Label>
                  <Input
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    disabled={clientFieldsDisabled}
                    className="h-9"
                    placeholder="1002"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-client-note" className="text-xs">Note</Label>
                <Textarea
                  id="edit-client-note"
                  value={clientNote}
                  onChange={(e) => setClientNote(e.target.value)}
                  disabled={clientFieldsDisabled}
                  placeholder="Ajouter une note pour cette réservation…"
                  rows={3}
                />
              </div>

              </div>
              <div className="shrink-0 px-4 py-3 border-t bg-background flex justify-between gap-3">
                {booking?.status !== "cancelled" && booking?.status !== "completed" && canCancelBooking ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setShowCancelDialog(true)}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Annuler la réservation
                  </Button>
                ) : <div />}
                <Button type="button" onClick={() => setActiveTab("prestations")}>
                  Suivant (Prestations) ➔
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="prestations" className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-3 data-[state=inactive]:hidden max-h-[60vh]">
              {isConcierge && treatmentsDisabled && (
                <Alert className="py-2 mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Les prestations ne sont plus modifiables pour cette réservation.
                  </AlertDescription>
                </Alert>
              )}

              <div className="relative shrink-0 mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={treatmentSearch}
                  onChange={(e) => setTreatmentSearch(e.target.value)}
                  placeholder="Rechercher un soin…"
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {(() => {
                  const q = treatmentSearch.trim().toLowerCase();
                  const filtered = (treatments ?? []).filter((t) => {
                    if (!q) return true;
                    return (
                      (t.name?.toLowerCase().includes(q)) ||
                      (t.category?.toLowerCase().includes(q))
                    );
                  });

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
                          const variants = treatment.treatment_variants ?? [];
                          const hasVariantChoice = variants.length >= 2;
                          const totalQty = getCartQuantity(treatment.id);

                          // Treatment with multiple variants → menu header + one row per variant.
                          if (hasVariantChoice) {
                            return (
                              <div key={treatment.id} className="border-b border-border/10 last:border-0">
                                <div className="flex items-center gap-1.5 py-1.5">
                                  <span className="font-medium text-foreground text-xs truncate flex-1">
                                    {treatment.name}
                                  </span>
                                  {totalQty > 0 && (
                                    <span className="shrink-0 text-[9px] font-bold text-muted-foreground">×{totalQty}</span>
                                  )}
                                </div>
                                {variants.map((v, vi) => {
                                  const variantQty = getCartQuantity(treatment.id, v.id);
                                  const label = v.label || (v.guest_count === 1 ? 'Solo' : v.guest_count === 2 ? 'Duo' : `×${v.guest_count}`);
                                  const displayPrice = v.price ?? treatment.price;
                                  const displayDuration = v.duration ?? treatment.duration;
                                  return (
                                    <div key={v.id} className={cn("flex items-center justify-between pl-2 pb-1", vi === variants.length - 1 && "pb-2")}>
                                      <div className="flex flex-col flex-1 pr-2 min-w-0">
                                        <span className="text-[10px] font-medium text-foreground">{label}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {displayPrice}€ • {displayDuration} min
                                        </span>
                                      </div>
                                      {variantQty > 0 ? (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => decrementCart(treatment.id, v.id)}
                                            disabled={treatmentsDisabled}
                                            className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                          >
                                            <Minus className="h-2.5 w-2.5" />
                                          </button>
                                          <span className="text-xs font-bold w-4 text-center">{variantQty}</span>
                                          <button
                                            type="button"
                                            onClick={() => incrementCart(treatment.id, v.id)}
                                            disabled={treatmentsDisabled}
                                            className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                          >
                                            <Plus className="h-2.5 w-2.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => addToCart(treatment.id, v.id)}
                                          disabled={treatmentsDisabled}
                                          className="shrink-0 bg-foreground text-background text-[9px] font-medium uppercase tracking-wide h-5 px-2.5 rounded-full hover:bg-foreground/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-foreground"
                                        >
                                          Ajouter
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }

                          // Treatment with 0-1 variant → single row (default variant resolved by addToCart).
                          const selectedVariant = variants[0] ?? null;
                          const displayPrice = selectedVariant?.price ?? treatment.price;
                          const displayDuration = selectedVariant?.duration ?? treatment.duration;
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
                                  {displayPrice}€ • {displayDuration} min
                                </span>
                              </div>

                              {totalQty > 0 ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => decrementCart(treatment.id)}
                                    disabled={treatmentsDisabled}
                                    className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  >
                                    <Minus className="h-2.5 w-2.5" />
                                  </button>
                                  <span className="text-xs font-bold w-4 text-center">{totalQty}</span>
                                  <button
                                    type="button"
                                    onClick={() => incrementCart(treatment.id)}
                                    disabled={treatmentsDisabled}
                                    className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  >
                                    <Plus className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addToCart(treatment.id)}
                                  disabled={treatmentsDisabled}
                                  className="shrink-0 bg-foreground text-background text-[9px] font-medium uppercase tracking-wide h-5 px-2.5 rounded-full hover:bg-foreground/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-foreground"
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
              
              <div className="shrink-0 border-t border-border bg-background pt-2 mt-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {cart.length > 0 ? (
                      <div className="flex items-center gap-1.5 overflow-x-auto">
                        {cartDetails.slice(0, 3).map(({ treatmentId, variantId, quantity, treatment }) => (
                          <div key={`${treatmentId}-${variantId ?? 'base'}`} className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 shrink-0">
                            <span className="text-[9px] font-medium truncate max-w-[60px]">{getCartLineDisplayName(treatment, variantId)}</span>
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

      {booking && (
        <CancelBookingDialog
          stackedOnDialog
          isOpen={showCancelDialog}
          onClose={() => setShowCancelDialog(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
            onSuccess?.();
            onOpenChange(false);
          }}
          bookingId={booking.id}
          booking={{
            booking_id: booking.booking_id,
            client_first_name: booking.client_first_name,
            client_last_name: booking.client_last_name,
            total_price: Number(booking.total_price ?? totalPrice) || 0,
            hotel_id: booking.hotel_id,
            status: booking.status,
            payment_method: booking.payment_method,
            payment_status: booking.payment_status,
            booking_date: booking.booking_date,
            booking_time: booking.booking_time,
          }}
          userRole={isConcierge ? "concierge" : "admin"}
        />
      )}

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