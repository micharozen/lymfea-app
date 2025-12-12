import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Check, ChevronsUpDown, CalendarIcon, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface CreateBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date;
  selectedTime?: string;
}

export default function CreateBookingDialog({
  open,
  onOpenChange,
  selectedDate,
  selectedTime,
}: CreateBookingDialogProps) {
  const queryClient = useQueryClient();
  const [hotelId, setHotelId] = useState("");
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+33");
  const [countryOpen, setCountryOpen] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [date, setDate] = useState<Date | undefined>(selectedDate);
  const [time, setTime] = useState(selectedTime || "");
  const [hairdresserId, setHairdresserId] = useState("");
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [serviceFilter, setServiceFilter] = useState<"all" | "female" | "male">("all");

  // Update date and time when props change
  useEffect(() => {
    if (selectedDate) {
      setDate(selectedDate);
    }
    if (selectedTime) {
      setTime(selectedTime);
    }
  }, [selectedDate, selectedTime]);

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

  // Fetch hairdressers based on selected hotel
  const { data: hairdressers } = useQuery({
    queryKey: ["hairdressers-for-hotel", hotelId],
    queryFn: async () => {
      if (!hotelId) {
        // If no hotel selected, fetch all active hairdressers (for admin)
        const { data, error } = await supabase
          .from("hairdressers")
          .select("id, first_name, last_name, status")
          .in("status", ["Actif", "active", "Active"])
          .order("first_name");
        if (error) throw error;
        return data;
      }
      
      // Fetch hairdressers linked to the selected hotel
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
        .eq("hotel_id", hotelId);

      if (error) throw error;
      
      return data
        ?.map((hh: any) => hh.hairdressers)
        .filter((h: any) => h && ["Actif", "active", "Active"].includes(h.status))
        .sort((a: any, b: any) => a.first_name.localeCompare(b.first_name)) || [];
    },
  });

  // Fetch treatments based on selected hotel
  const { data: treatments } = useQuery({
    queryKey: ["treatment_menus", hotelId],
    queryFn: async () => {
      let query = supabase
        .from("treatment_menus")
        .select("*")
        .in("status", ["Actif", "active", "Active"])
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      
      // Filter by hotel if selected
      if (hotelId) {
        query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Filter treatments based on service filter
  const filteredTreatments = useMemo(() => {
    if (!treatments) return [];
    
    return treatments.filter(t => {
      if (serviceFilter === "all") return true;
      if (serviceFilter === "female") return t.service_for === "Female" || t.service_for === "All";
      if (serviceFilter === "male") return t.service_for === "Male" || t.service_for === "All";
      return true;
    });
  }, [treatments, serviceFilter]);

  // Group treatments by category
  const groupedTreatments = useMemo(() => {
    const groups: Record<string, typeof filteredTreatments> = {};
    filteredTreatments.forEach(t => {
      const cat = t.category || "Autres";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return groups;
  }, [filteredTreatments]);

  // Calculate totals
  const { totalDuration } = useMemo(() => {
    if (!treatments || selectedTreatments.length === 0) return { totalDuration: 0 };
    
    const duration = selectedTreatments.reduce((sum, treatmentId) => {
      const treatment = treatments.find(t => t.id === treatmentId);
      return sum + (treatment?.duration || 0);
    }, 0);
    
    return { totalDuration: duration };
  }, [selectedTreatments, treatments]);

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

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const hotel = hotels?.find((h) => h.id === data.hotelId);
      const hairdresser = hairdressers?.find((h) => h.id === data.hairdresserId);
      
      // Déterminer le statut initial
      const initialStatus = data.hairdresserId ? "assigned" : "pending";
      const assignedAt = data.hairdresserId ? new Date().toISOString() : null;
      
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          hotel_id: data.hotelId,
          hotel_name: hotel?.name || "",
          client_first_name: data.clientFirstName,
          client_last_name: data.clientLastName,
          phone: `${data.countryCode} ${data.phone}`,
          room_number: data.roomNumber,
          booking_date: data.date,
          booking_time: data.time,
          hairdresser_id: data.hairdresserId || null,
          hairdresser_name: hairdresser ? `${hairdresser.first_name} ${hairdresser.last_name}` : null,
          status: initialStatus,
          assigned_at: assignedAt,
          total_price: data.totalPrice,
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      // Insérer les traitements sélectionnés
      if (data.selectedTreatments.length > 0) {
        const treatmentRecords = data.selectedTreatments.map((treatmentId: string) => ({
          booking_id: bookingData.id,
          treatment_id: treatmentId,
        }));

        const { error: treatmentsError } = await supabase
          .from("booking_treatments")
          .insert(treatmentRecords);

        if (treatmentsError) throw treatmentsError;
      }

      // Déclencher les notifications
      try {
        if (!data.isAdmin) {
          await supabase.functions.invoke('notify-admin-new-booking', {
            body: { bookingId: bookingData.id }
          });
        }
        
        await supabase.functions.invoke('trigger-new-booking-notifications', {
          body: { bookingId: bookingData.id }
        });
      } catch (notifError) {
        console.error('Error triggering notifications:', notifError);
      }

      return bookingData;
    },
    onSuccess: () => {
      toast({
        title: "Réservation créée",
        description: "La réservation a été créée avec succès.",
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la création de la réservation.",
        variant: "destructive",
      });
      console.error("Error creating booking:", error);
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

    if (selectedTreatments.length === 0) {
      toast({
        title: "Prestation requise",
        description: "Veuillez sélectionner au moins une prestation.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      hotelId,
      clientFirstName,
      clientLastName,
      phone,
      countryCode,
      roomNumber,
      date: date ? format(date, "yyyy-MM-dd") : "",
      time,
      hairdresserId,
      selectedTreatments,
      totalPrice,
      isAdmin,
    });
  };

  const handleClose = () => {
    setHotelId("");
    setClientFirstName("");
    setClientLastName("");
    setPhone("");
    setCountryCode("+33");
    setRoomNumber("");
    setDate(selectedDate);
    setTime(selectedTime || "");
    setHairdresserId("");
    setSelectedTreatments([]);
    setTotalPrice(0);
    setServiceFilter("all");
    onOpenChange(false);
  };

  const addTreatment = (treatmentId: string) => {
    if (!selectedTreatments.includes(treatmentId)) {
      setSelectedTreatments(prev => [...prev, treatmentId]);
    }
  };

  const removeTreatment = (treatmentId: string) => {
    setSelectedTreatments(prev => prev.filter(id => id !== treatmentId));
  };

  // Get selected treatment details for summary
  const selectedTreatmentDetails = useMemo(() => {
    if (!treatments) return [];
    return selectedTreatments
      .map(id => treatments.find(t => t.id === id))
      .filter(Boolean);
  }, [selectedTreatments, treatments]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle>Créer une réservation</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden flex">
            {/* Left Column - Form Fields */}
            <div className="w-1/2 p-4 overflow-y-auto border-r space-y-3">
              {/* Hotel */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Hôtel *</Label>
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

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Date *</Label>
                  <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full h-9 justify-start text-left font-normal text-sm",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {date ? format(date, "dd/MM/yyyy", { locale: fr }) : "Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(selectedDate) => {
                          setDate(selectedDate);
                          setDatePopoverOpen(false);
                        }}
                        initialFocus
                        className="pointer-events-auto"
                        locale={fr}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Heure *</Label>
                  <Input
                    type="time"
                    step="600"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Client Info */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Prénom *</Label>
                  <Input
                    value={clientFirstName}
                    onChange={(e) => setClientFirstName(e.target.value)}
                    placeholder="Prénom"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Nom *</Label>
                  <Input
                    value={clientLastName}
                    onChange={(e) => setClientLastName(e.target.value)}
                    placeholder="Nom"
                    className="h-9"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Téléphone *</Label>
                <div className="flex gap-2">
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-[100px] h-9 justify-between text-sm"
                      >
                        {countries.find((c) => c.code === countryCode)?.flag} {countryCode}
                        <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
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
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneNumber(e.target.value, countryCode))}
                    placeholder="Numéro"
                    className="flex-1 h-9"
                  />
                </div>
              </div>

              {/* Room & Hairdresser */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Chambre</Label>
                  <Input
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="1002"
                    className="h-9"
                  />
                </div>
                {isAdmin && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Coiffeur</Label>
                    <Select value={hairdresserId || "none"} onValueChange={(v) => setHairdresserId(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Optionnel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Non assigné</SelectItem>
                        {hairdressers?.map((h) => (
                          <SelectItem key={h.id} value={h.id}>
                            {h.first_name} {h.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Service Filter */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Prestations</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={serviceFilter === "all" ? "default" : "outline"}
                    onClick={() => setServiceFilter("all")}
                    className="h-7 text-xs flex-1"
                  >
                    Tous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={serviceFilter === "female" ? "default" : "outline"}
                    onClick={() => setServiceFilter("female")}
                    className="h-7 text-xs flex-1"
                  >
                    Femme
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={serviceFilter === "male" ? "default" : "outline"}
                    onClick={() => setServiceFilter("male")}
                    className="h-7 text-xs flex-1"
                  >
                    Homme
                  </Button>
                </div>
              </div>

              {/* Compact Treatment List */}
              <ScrollArea className="h-[180px] border rounded-md">
                <div className="p-1">
                  {Object.entries(groupedTreatments).map(([category, items]) => (
                    <div key={category} className="mb-2">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1 bg-muted/50 sticky top-0">
                        {category}
                      </div>
                      {items.map((treatment) => {
                        const isSelected = selectedTreatments.includes(treatment.id);
                        return (
                          <div
                            key={treatment.id}
                            onClick={() => !isSelected && addTreatment(treatment.id)}
                            className={cn(
                              "flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-muted/30 transition-colors rounded text-sm",
                              isSelected && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <span className="truncate flex-1 mr-2">{treatment.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground">{treatment.duration}min</span>
                              <span className="text-xs font-medium">{treatment.price}€</span>
                              {!isSelected && (
                                <Plus className="h-3 w-3 text-primary" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {filteredTreatments.length === 0 && (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      {hotelId ? "Aucune prestation disponible" : "Sélectionnez un hôtel"}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right Column - Summary */}
            <div className="w-1/2 p-4 flex flex-col bg-muted/20">
              <h3 className="text-sm font-semibold mb-2">Récapitulatif</h3>
              
              {/* Selected Treatments Table */}
              <ScrollArea className="flex-1 border rounded-md bg-background">
                {selectedTreatmentDetails.length > 0 ? (
                  <div className="divide-y">
                    {selectedTreatmentDetails.map((treatment) => (
                      <div key={treatment!.id} className="flex items-center gap-2 p-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{treatment!.name}</div>
                          <div className="text-xs text-muted-foreground">{treatment!.category}</div>
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">
                          {treatment!.duration}min
                        </div>
                        <div className="font-medium shrink-0 w-14 text-right">
                          {treatment!.price}€
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => removeTreatment(treatment!.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full min-h-[120px] text-sm text-muted-foreground">
                    Cliquez sur une prestation pour l'ajouter
                  </div>
                )}
              </ScrollArea>

              {/* Totals */}
              {selectedTreatments.length > 0 && (
                <div className="mt-3 p-3 bg-primary/5 rounded-lg border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Durée totale</span>
                    <span className="font-medium">{totalDuration} min</span>
                  </div>
                  <div className="flex justify-between text-base mt-1">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-primary">{totalPrice}€</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 border-t flex justify-between items-center bg-background">
            <Button type="button" variant="outline" onClick={handleClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={createMutation.isPending || selectedTreatments.length === 0}>
              {createMutation.isPending ? "Création..." : "Créer la réservation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}