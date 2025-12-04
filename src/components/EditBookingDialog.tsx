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
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+1", label: "USA", flag: "🇺🇸" },
  { code: "+44", label: "UK", flag: "🇬🇧" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
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

const getPaymentStatusBadge = (paymentStatus?: string | null) => {
  if (!paymentStatus) return { label: '-', className: 'bg-muted/50 text-muted-foreground' };
  
  switch (paymentStatus) {
    case 'paid':
      return { label: 'Payé', className: 'bg-success/10 text-success border-success/30' };
    case 'charged_to_room':
      return { label: 'Facturé chambre', className: 'bg-info/10 text-info border-info/30' };
    case 'pending':
      return { label: 'Paiement en attente', className: 'bg-warning/10 text-warning border-warning/30' };
    case 'failed':
      return { label: 'Paiement échoué', className: 'bg-destructive/10 text-destructive border-destructive/30' };
    default:
      return { label: paymentStatus, className: 'bg-muted/50 text-muted-foreground' };
  }
};

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
        .filter((h: any) => h && h.status === "Actif")
        .sort((a: any, b: any) => a.first_name.localeCompare(b.first_name)) || [];
    },
  });

  const { data: treatments } = useQuery({
    queryKey: ["treatment_menus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("*")
        .eq("status", "Actif")
        .order("sort_order");
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
      if (!booking?.id) return;

      const hairdresser = hairdressers?.find((h) => h.id === bookingData.hairdresser_id);
      
      // Gestion du statut et de assigned_at
      let newStatus = bookingData.status;
      let assignedAt = booking.assigned_at;
      
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
          hairdresser_name: hairdresser ? `${hairdresser.first_name} ${hairdresser.last_name}` : null,
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking_treatments", booking?.id] });
      queryClient.invalidateQueries({ queryKey: ["booking_treatments_details", booking?.id] });
      toast({
        title: "Succès",
        description: "La réservation a été modifiée avec succès",
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg">{viewMode === "view" ? "Détails de la réservation" : "Modifier la réservation"}</DialogTitle>
        </DialogHeader>

        {viewMode === "view" ? (
          <div className="space-y-3">
            {/* En-tête */}
            <div className="flex items-center justify-between pb-3 border-b">
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
                  variant={
                    booking?.status === "Terminé" ? "default" :
                    booking?.status === "Annulé" ? "destructive" :
                    booking?.status === "En attente" ? "secondary" :
                    booking?.status === "Assigné" ? "default" :
                    "outline"
                  }
                  className={
                    booking?.status === "Terminé" ? "bg-green-500 hover:bg-green-600 text-white" :
                    booking?.status === "Annulé" ? "bg-red-500 hover:bg-red-600 text-white" :
                    booking?.status === "En attente" ? "bg-orange-500 hover:bg-orange-600 text-white" :
                    booking?.status === "Assigné" ? "bg-blue-500 hover:bg-blue-600 text-white" :
                    ""
                  }
                >
                  {booking?.status}
                </Badge>
                {booking?.payment_status && (
                  <Badge variant="outline" className={`text-xs ${getPaymentStatusBadge(booking.payment_status).className}`}>
                    {getPaymentStatusBadge(booking.payment_status).label}
                  </Badge>
                )}
              </div>
            </div>

            {/* Infos principales */}
            <div className="p-3 bg-muted/30 rounded space-y-3">
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
                <div className="text-left">
                  <p className="text-xs text-muted-foreground mb-1">Date</p>
                  <p className="font-medium text-sm">{booking?.booking_date && format(new Date(booking.booking_date), "dd-MM-yyyy")}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground mb-1">Heure</p>
                  <p className="font-medium text-sm">{booking?.booking_time && booking.booking_time.substring(0, 5)}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground mb-1">Chambre</p>
                  <p className="font-medium text-sm">{booking?.room_number || "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
                <div className="text-left">
                  <p className="text-xs text-muted-foreground mb-1">Prix total</p>
                  <p className="font-semibold text-sm">€{totalPrice.toFixed(2)}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground mb-1">Durée</p>
                  <p className="font-semibold text-sm">{bookingTreatments && bookingTreatments.length > 0 ? bookingTreatments.reduce((total, t) => total + (t.duration || 0), 0) : 0} min</p>
                </div>
                <div></div>
              </div>
            </div>

            {/* Prestations */}
            {bookingTreatments && bookingTreatments.length > 0 && (
              <div className="p-3 bg-muted/30 rounded">
                <p className="text-xs text-muted-foreground mb-2">Prestations</p>
                <div className="space-y-1.5">
                  {bookingTreatments.map((treatment) => (
                    <div key={treatment.id} className="flex items-center gap-2 p-2 bg-background border rounded">
                      <div className="w-6 h-6 bg-muted rounded flex items-center justify-center shrink-0 text-xs">
                        💇
                      </div>
                      <p className="font-medium text-sm flex-1">{treatment.name}</p>
                      <p className="text-xs text-muted-foreground">{treatment.category}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coiffeur */}
            <div className="p-3 bg-muted/30 rounded">
              <p className="text-xs text-muted-foreground mb-2">Coiffeur</p>
              {booking?.hairdresser_name && !showAssignHairdresser ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="font-medium text-sm">{booking.hairdresser_name}</p>
                  </div>
                  {isAdmin && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setShowAssignHairdresser(true);
                        setSelectedHairdresserId(booking.hairdresser_id || "");
                      }}
                      className="h-7 text-xs"
                    >
                      Modifier
                    </Button>
                  )}
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
                            toast({
                              title: "Succès",
                              description: hairdresserId ? "Coiffeur assigné avec succès" : "Coiffeur retiré avec succès",
                            });
                            queryClient.invalidateQueries({ queryKey: ["bookings"] });
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
            <div className="p-3 bg-muted/30 rounded">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Client</p>
                  <p className="font-medium text-sm">{booking?.client_first_name} {booking?.client_last_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Téléphone</p>
                  <p className="font-medium text-sm">{booking?.phone}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-3 border-t">
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
            <TabsContent value="info" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-hotel">Hôtel *</Label>
                  <Select value={hotelId} onValueChange={setHotelId}>
                    <SelectTrigger>
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

                <div className="space-y-2">
                  <Label htmlFor="edit-status">Statut *</Label>
                  <Select value={status} onValueChange={setStatus} disabled>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="En attente">En attente</SelectItem>
                        <SelectItem value="Assigné">Assigné</SelectItem>
                        <SelectItem value="Terminé">Terminé</SelectItem>
                        <SelectItem value="Annulé">Annulé</SelectItem>
                      </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-date">Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
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

                <div className="space-y-2">
                  <Label htmlFor="edit-time">Heure *</Label>
                  <Input
                    id="edit-time"
                    type="time"
                    step="600"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-firstName">Prénom *</Label>
                  <Input
                    id="edit-firstName"
                    value={clientFirstName}
                    onChange={(e) => setClientFirstName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-lastName">Nom *</Label>
                  <Input
                    id="edit-lastName"
                    value={clientLastName}
                    onChange={(e) => setClientLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Téléphone *</Label>
                  <div className="flex gap-2">
                    <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={countryOpen}
                          className="w-[140px] justify-between"
                        >
                          {countries.find((country) => country.code === countryCode)?.flag}{" "}
                          {countryCode}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0">
                        <Command>
                          <CommandInput placeholder="Rechercher..." />
                          <CommandList>
                            <CommandEmpty>Aucun pays trouvé.</CommandEmpty>
                            <CommandGroup>
                              {countries.map((country) => (
                                <CommandItem
                                  key={country.code}
                                  value={country.code}
                                  onSelect={() => {
                                    setCountryCode(country.code);
                                    setCountryOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      countryCode === country.code ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {country.flag} {country.label}
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
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-room">Numéro de chambre</Label>
                  <Input
                    id="edit-room"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-hairdresser">Coiffeur</Label>
                <Select 
                  value={hairdresserId || "none"} 
                  onValueChange={(value) => {
                    const newValue = value === "none" ? "" : value;
                    setHairdresserId(newValue);
                  }}
                >
                  <SelectTrigger id="edit-hairdresser">
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
              </div>

              <div className="flex justify-between gap-2 pt-4 mt-4 border-t">
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

            <TabsContent value="prestations" className="space-y-4 mt-4">
              <Tabs defaultValue="Women" className="w-full">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="Women">WOMEN'S MENU</TabsTrigger>
                  <TabsTrigger value="Men">MEN'S MENU</TabsTrigger>
                </TabsList>
                
                <TabsContent value="Women" className="mt-4">
                  <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                    {treatments?.filter(t => t.service_for === "Female" || t.service_for === "All").map((treatment) => (
                      <div 
                        key={treatment.id} 
                        className="flex items-center justify-between p-4 border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-base">{treatment.name}</div>
                          <div className="text-sm text-muted-foreground mt-1">{treatment.category}</div>
                          {treatment.description && (
                            <div className="text-xs text-muted-foreground mt-1">{treatment.description}</div>
                          )}
                          <div className="text-sm font-medium mt-2">
                            {treatment.price}€ • {treatment.duration} min
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedTreatments.includes(treatment.id) ? "default" : "outline"}
                          onClick={() => toggleTreatment(treatment.id)}
                          className="ml-4"
                        >
                          {selectedTreatments.includes(treatment.id) ? "Sélectionné" : "Select"}
                        </Button>
                      </div>
                    ))}
                    {!treatments?.filter(t => t.service_for === "Female" || t.service_for === "All").length && (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        Aucune prestation disponible
                      </div>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="Men" className="mt-4">
                  <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                    {treatments?.filter(t => t.service_for === "Male" || t.service_for === "All").map((treatment) => (
                      <div 
                        key={treatment.id} 
                        className="flex items-center justify-between p-4 border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-base">{treatment.name}</div>
                          <div className="text-sm text-muted-foreground mt-1">{treatment.category}</div>
                          {treatment.description && (
                            <div className="text-xs text-muted-foreground mt-1">{treatment.description}</div>
                          )}
                          <div className="text-sm font-medium mt-2">
                            {treatment.price}€ • {treatment.duration} min
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedTreatments.includes(treatment.id) ? "default" : "outline"}
                          onClick={() => toggleTreatment(treatment.id)}
                          className="ml-4"
                        >
                          {selectedTreatments.includes(treatment.id) ? "Sélectionné" : "Select"}
                        </Button>
                      </div>
                    ))}
                    {!treatments?.filter(t => t.service_for === "Male" || t.service_for === "All").length && (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        Aucune prestation disponible
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              
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
                  Retour
                </Button>
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
