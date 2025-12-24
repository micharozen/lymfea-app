import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, ChevronsUpDown, Trash2, CalendarIcon, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getBookingStatusConfig, getPaymentStatusConfig } from "@/utils/statusStyles";
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
  payment_status?: string | null;
  payment_method?: string | null;
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
  const [countryOpen, setCountryOpen] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("");
  const [status, setStatus] = useState("En attente");
  const [hairdresserId, setHairdresserId] = useState("");
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);
  const [activeTab, setActiveTab] = useState("info");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
  const [showAssignHairdresser, setShowAssignHairdresser] = useState(false);
  const [selectedHairdresserId, setSelectedHairdresserId] = useState("");
  const [treatmentFilter, setTreatmentFilter] = useState<"female" | "male">("female");
  

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

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

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
    queryKey: ["hairdresser-availability", booking?.hotel_id, date, time, selectedTreatments, booking?.id],
    enabled: !!booking?.hotel_id && !!date && !!time && viewMode === "edit",
    queryFn: async () => {
      if (!date || !time) return {};
      
      const selectedDate = format(date, "yyyy-MM-dd");
      
      // Calculate total duration of selected treatments
      const totalDuration = selectedTreatments.reduce((sum, treatmentId) => {
        const treatment = treatments?.find(t => t.id === treatmentId);
        return sum + (treatment?.duration || 0);
      }, 0) || 60; // Default 60 min if no treatments selected
      
      // Calculate start and end time in minutes
      const [hours, minutes] = time.split(':').map(Number);
      const startTime = hours * 60 + minutes;
      const endTime = startTime + totalDuration;
      
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
            duration
          )
        `)
        .eq("booking_id", booking!.id);
      if (error) throw error;
      return data?.map((bt: any) => bt.treatment_menus).filter(Boolean) || [];
    },
  });

  // Charger les traitements existants quand la réservation change
  useEffect(() => {
    if (existingTreatments) {
      setSelectedTreatments(existingTreatments.map(t => t.treatment_id));
    }
  }, [existingTreatments]);

  // Recalculer le prix total quand les traitements changent
  useEffect(() => {
    if (treatments && selectedTreatments.length > 0) {
      const total = selectedTreatments.reduce((sum, treatmentId) => {
        const treatment = treatments.find(t => t.id === treatmentId);
        return sum + (treatment?.price || 0);
      }, 0);
      setTotalPrice(total);
    } else {
      setTotalPrice(0);
    }
  }, [selectedTreatments, treatments]);

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
      
      return { wasAssigned, hairdresserChanged };
    },
    onSuccess: async (result) => {
      console.log("Update success - wasAssigned:", result?.wasAssigned, "hairdresserChanged:", result?.hairdresserChanged, "bookingId:", booking?.id);
      
      // Send push notification if hairdresser was newly assigned OR changed
      if ((result?.wasAssigned || result?.hairdresserChanged) && booking?.id) {
        console.log("Triggering push notification for booking:", booking.id);
        try {
          const { data, error } = await supabase.functions.invoke('trigger-new-booking-notifications', {
            body: { bookingId: booking.id }
          });
          console.log("Push notification result:", data, error);
        } catch (notifError) {
          console.error("Error sending push notification:", notifError);
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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!booking?.id) return;

      const { error: deleteTreatmentsError } = await supabase
        .from("booking_treatments")
        .delete()
        .eq("booking_id", booking.id);

      if (deleteTreatmentsError) throw deleteTreatmentsError;

      const { error: deleteBookingError } = await supabase
        .from("bookings")
        .delete()
        .eq("id", booking.id);

      if (deleteBookingError) throw deleteBookingError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({
        title: "Succès",
        description: "La réservation a été supprimée avec succès",
      });
      setShowDeleteDialog(false);
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la suppression de la réservation",
        variant: "destructive",
      });
      console.error("Error deleting booking:", error);
    },
  });

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

    // Vérifier les chevauchements si un coiffeur est assigné
    if (hairdresserId && selectedTreatments.length > 0) {
      const totalDuration = selectedTreatments.reduce((sum, treatmentId) => {
        const treatment = treatments?.find(t => t.id === treatmentId);
        return sum + (treatment?.duration || 0);
      }, 0);

      // Calculer l'heure de fin
      const [hours, minutes] = time.split(':').map(Number);
      const startTime = hours * 60 + minutes;
      const endTime = startTime + totalDuration;

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
          }, 0);
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
      treatments: selectedTreatments,
      status: status,
    });
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const toggleTreatment = (treatmentId: string) => {
    setSelectedTreatments(prev => 
      prev.includes(treatmentId) 
        ? prev.filter(id => id !== treatmentId)
        : [...prev, treatmentId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) setViewMode("view");
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-base">{viewMode === "view" ? "Détails de la réservation" : "Modifier la réservation"}</DialogTitle>
        </DialogHeader>

        {viewMode === "view" ? (
          <div className="space-y-2">
            {/* En-tête */}
            <div className="flex items-center justify-between pb-2 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">#{booking?.booking_id}</p>
                  <p className="text-xs text-muted-foreground">{booking?.hotel_name}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge 
                  className={getBookingStatusConfig(booking?.status || 'pending').badgeClass}
                >
                  {getBookingStatusConfig(booking?.status || 'pending').label}
                </Badge>
                {booking?.payment_status && (
                  <Badge variant="outline" className={`text-xs ${getPaymentStatusConfig(booking.payment_status).badgeClass}`}>
                    {getPaymentStatusConfig(booking.payment_status).label}
                  </Badge>
                )}
              </div>
            </div>

            {/* Infos principales */}
            <div className="p-2 bg-muted/30 rounded space-y-2">
              <div className="grid grid-cols-5 gap-2">
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium text-sm">{booking?.booking_date && format(new Date(booking.booking_date), "dd-MM-yyyy")}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">Heure</p>
                  <p className="font-medium text-sm">{booking?.booking_time && booking.booking_time.substring(0, 5)}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">Chambre</p>
                  <p className="font-medium text-sm">{booking?.room_number || "-"}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">Prix</p>
                  <p className="font-semibold text-sm">€{totalPrice.toFixed(2)}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">Durée</p>
                  <p className="font-semibold text-sm">{bookingTreatments && bookingTreatments.length > 0 ? bookingTreatments.reduce((total, t) => total + (t.duration || 0), 0) : 0} min</p>
                </div>
              </div>
            </div>

            {/* Prestations */}
            {bookingTreatments && bookingTreatments.length > 0 && (
              <div className="p-2 bg-muted/30 rounded">
                <p className="text-xs text-muted-foreground mb-1">Prestations</p>
                <div className="space-y-1">
                  {bookingTreatments.map((treatment) => (
                    <div key={treatment.id} className="flex items-center justify-between text-sm">
                      <span>{treatment.name}</span>
                      <span className="font-medium">€{(treatment.price || 0).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm pt-1 mt-1 border-t border-border/50">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold">€{bookingTreatments.reduce((sum, t) => sum + (t?.price || 0), 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Coiffeur */}
            <div className="p-2 bg-muted/30 rounded">
              <p className="text-xs text-muted-foreground mb-1">Coiffeur</p>
              {booking?.hairdresser_name ? (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="font-medium text-sm">{booking.hairdresser_name}</p>
                </div>
              ) : isAdmin ? (
                showAssignHairdresser ? (
                  <div className="space-y-2">
                    <Select 
                      value={selectedHairdresserId || "none"} 
                      onValueChange={setSelectedHairdresserId}
                    >
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
                          
                          // Déterminer le nouveau statut
                          let newStatus = booking!.status;
                          let assignedAt = booking!.assigned_at;
                          
                          if (hairdresserId && booking!.status === "En attente") {
                            newStatus = "Assigné";
                            assignedAt = new Date().toISOString();
                          } else if (!hairdresserId && booking!.status === "Assigné") {
                            newStatus = "En attente";
                            assignedAt = null;
                          }
                          
                          const { error } = await supabase
                            .from("bookings")
                            .update({
                              hairdresser_id: hairdresserId,
                              hairdresser_name: hairdresser ? `${hairdresser.first_name} ${hairdresser.last_name}` : null,
                              status: newStatus,
                              assigned_at: assignedAt,
                            })
                            .eq("id", booking!.id);
                            
                          if (error) {
                            toast({
                              title: "Erreur",
                              description: "Impossible d'assigner le coiffeur",
                              variant: "destructive",
                            });
                          } else {
                            // Track if hairdresser was newly assigned or changed
                            const wasAssigned = hairdresserId && !booking!.hairdresser_id;
                            const hairdresserChanged = hairdresserId && booking!.hairdresser_id && 
                                                        hairdresserId !== booking!.hairdresser_id;
                            
                            // Send push notification if hairdresser was newly assigned OR changed
                            if (wasAssigned || hairdresserChanged) {
                              console.log("Triggering push notification for booking:", booking!.id);
                              try {
                                const { data, error: notifError } = await supabase.functions.invoke('trigger-new-booking-notifications', {
                                  body: { bookingId: booking!.id }
                                });
                                console.log("Push notification result:", data, notifError);
                              } catch (notifError) {
                                console.error("Error sending push notification:", notifError);
                              }
                            }
                            
                            toast({
                              title: "Succès",
                              description: hairdresserId ? "Coiffeur assigné avec succès" : "Coiffeur retiré avec succès",
                            });
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
                        onClick={() => {
                          setShowAssignHairdresser(false);
                          setSelectedHairdresserId(booking?.hairdresser_id || "");
                        }}
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
                    onClick={() => {
                      setShowAssignHairdresser(true);
                      setSelectedHairdresserId("");
                    }}
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
            <div className="p-2 bg-muted/30 rounded">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="font-medium text-sm">{booking?.client_first_name} {booking?.client_last_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Téléphone</p>
                  <p className="font-medium text-sm">{booking?.phone}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button 
                type="button" 
                variant="outline"
                onClick={handleClose}
              >
                Fermer
              </Button>
              {!showAssignHairdresser && (
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </Button>
                  <Button 
                    type="button" 
                    onClick={() => {
                      setViewMode("edit");
                      setActiveTab("info");
                    }}
                  >
                    Modifier
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsContent value="info" className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-date" className="text-xs">Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full h-9 justify-start text-left font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "dd/MM/yyyy", { locale: fr }) : <span>Sélectionner une date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        initialFocus
                        className="pointer-events-auto"
                        locale={fr}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-time" className="text-xs">Heure *</Label>
                  <Input
                    id="edit-time"
                    type="time"
                    step="600"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-phone" className="text-xs">Téléphone *</Label>
                  <div className="flex gap-2">
                    <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={countryOpen}
                          className="w-[120px] h-9 justify-between text-xs"
                        >
                          {countries.find((country) => country.code === countryCode)?.flag}{" "}
                          {countryCode}
                          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-0 border shadow-lg z-50 bg-popover" align="start" side="bottom" sideOffset={4}>
                        <Command>
                          <CommandInput placeholder="Rechercher un pays..." className="h-9 text-sm" />
                          <CommandList className="max-h-[200px]">
                            <CommandEmpty>Pays non trouvé</CommandEmpty>
                            <CommandGroup>
                              {countries.map((country) => (
                                <CommandItem
                                  key={country.code}
                                  value={`${country.label} ${country.code}`}
                                  onSelect={() => {
                                    setCountryCode(country.code);
                                    setCountryOpen(false);
                                  }}
                                  className="text-sm cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-3.5 w-3.5",
                                      countryCode === country.code ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {country.flag} {country.label} ({country.code})
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Input
                      id="edit-phone"
                      value={phone}
                      onChange={(e) => {
                        const formatted = formatPhoneNumber(e.target.value, countryCode);
                        setPhone(formatted);
                      }}
                      className="flex-1 h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-room" className="text-xs">Numéro de chambre</Label>
                  <Input
                    id="edit-room"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="h-9"
                  />
                </div>
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
                <p className="text-[10px] text-muted-foreground">
                  Seuls les coiffeurs disponibles pour ce créneau sont sélectionnables.
                </p>
              </div>

              <div className="flex justify-between gap-2 pt-2 mt-2 border-t">
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => setViewMode("view")}
                  >
                    Annuler
                  </Button>
                  <Button 
                    type="button" 
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </Button>
                </div>
                <Button 
                  type="button" 
                  onClick={() => setActiveTab("prestations")}
                >
                  Suivant
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="prestations" className="space-y-0 mt-0">
              {/* Menu Tabs (Clean Underline Style) */}
              <div className="flex items-center gap-6 border-b border-border/50 mb-3">
                {(["female", "male"] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTreatmentFilter(f)}
                    className={cn(
                      "pb-2 text-[10px] font-bold uppercase tracking-widest transition-colors",
                      treatmentFilter === f 
                        ? "text-foreground border-b-2 border-foreground" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f === "female" ? "WOMEN'S MENU" : "MEN'S MENU"}
                  </button>
                ))}
              </div>

              {/* SERVICE LIST - Grouped by category */}
              <div className="max-h-[300px] overflow-y-auto">
                {(() => {
                  const filtered = treatments?.filter(t => 
                    treatmentFilter === "female" 
                      ? (t.service_for === "Female" || t.service_for === "All")
                      : (t.service_for === "Male" || t.service_for === "All")
                  ) || [];
                  
                  // Group by category
                  const grouped: Record<string, typeof filtered> = {};
                  filtered.forEach(t => {
                    const c = t.category || "Autres";
                    if (!grouped[c]) grouped[c] = [];
                    grouped[c].push(t);
                  });

                  if (!filtered.length) {
                    return (
                      <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
                        Aucune prestation disponible
                      </div>
                    );
                  }

                  return Object.entries(grouped).map(([category, items]) => (
                    <div key={category} className="mb-4">
                      {/* Category Header */}
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 pb-1 border-b border-border/30">
                        {category}
                      </h3>
                      
                      {/* Clean Service Rows */}
                      <div>
                        {items.map((treatment) => (
                          <div 
                            key={treatment.id} 
                            className="flex items-center justify-between py-2 border-b border-border/20 group"
                          >
                            {/* Left: Info */}
                            <div className="flex flex-col gap-0.5 flex-1 pr-3">
                              <span className="font-bold text-foreground text-sm">
                                {treatment.name}
                              </span>
                              <span className="text-xs font-medium text-muted-foreground">
                                {treatment.price}€ • {treatment.duration} min
                              </span>
                            </div>

                            {/* Right: Compact Black Pill Button */}
                            <button
                              type="button"
                              onClick={() => toggleTreatment(treatment.id)}
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-wide h-6 px-3 rounded-full transition-colors shrink-0",
                                selectedTreatments.includes(treatment.id)
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-foreground text-background hover:bg-foreground/80"
                              )}
                            >
                              {selectedTreatments.includes(treatment.id) ? "Sélectionné" : "Select"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
              
              {selectedTreatments.length > 0 && (
                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg font-semibold mt-4">
                  <span>Prix total</span>
                  <span className="text-lg">{totalPrice}€</span>
                </div>
              )}

              <div className="flex justify-between gap-2 pt-4 mt-4 border-t">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setActiveTab("info")}
                >
                  ← Retour
                </Button>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => setViewMode("view")}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Modification..." : "Modifier"}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </form>
        )}
      </DialogContent>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cette réservation ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Dialog>
  );
}
