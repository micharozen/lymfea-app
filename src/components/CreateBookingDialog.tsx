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
import { Check, ChevronsUpDown, CalendarIcon, X, Plus, Minus, ArrowRight, ArrowLeft } from "lucide-react";
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

interface CartItem {
  treatmentId: string;
  quantity: number;
}

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
  
  // Step state
  const [currentStep, setCurrentStep] = useState(1);
  
  // Form state
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
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  
  // Cart state with quantities
  const [cart, setCart] = useState<CartItem[]>([]);
  const [serviceFilter, setServiceFilter] = useState<"all" | "female" | "male">("all");

  useEffect(() => {
    if (selectedDate) setDate(selectedDate);
    if (selectedTime) setTime(selectedTime);
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

  const { data: hairdressers } = useQuery({
    queryKey: ["hairdressers-for-hotel", hotelId],
    queryFn: async () => {
      if (!hotelId) {
        const { data, error } = await supabase
          .from("hairdressers")
          .select("id, first_name, last_name, status")
          .in("status", ["Actif", "active", "Active"])
          .order("first_name");
        if (error) throw error;
        return data;
      }
      
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

  const { data: treatments } = useQuery({
    queryKey: ["treatment_menus", hotelId],
    queryFn: async () => {
      let query = supabase
        .from("treatment_menus")
        .select("*")
        .in("status", ["Actif", "active", "Active"])
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      
      if (hotelId) {
        query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const filteredTreatments = useMemo(() => {
    if (!treatments) return [];
    
    return treatments.filter(t => {
      if (serviceFilter === "all") return true;
      if (serviceFilter === "female") return t.service_for === "Female" || t.service_for === "All";
      if (serviceFilter === "male") return t.service_for === "Male" || t.service_for === "All";
      return true;
    });
  }, [treatments, serviceFilter]);

  const groupedTreatments = useMemo(() => {
    const groups: Record<string, typeof filteredTreatments> = {};
    filteredTreatments.forEach(t => {
      const cat = t.category || "Autres";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return groups;
  }, [filteredTreatments]);

  // Calculate totals from cart
  const { totalPrice, totalDuration } = useMemo(() => {
    if (!treatments || cart.length === 0) return { totalPrice: 0, totalDuration: 0 };
    
    let price = 0;
    let duration = 0;
    
    cart.forEach(item => {
      const treatment = treatments.find(t => t.id === item.treatmentId);
      if (treatment) {
        price += (treatment.price || 0) * item.quantity;
        duration += (treatment.duration || 0) * item.quantity;
      }
    });
    
    return { totalPrice: price, totalDuration: duration };
  }, [cart, treatments]);

  // Cart helper to get treatment details
  const cartWithDetails = useMemo(() => {
    if (!treatments) return [];
    return cart.map(item => {
      const treatment = treatments.find(t => t.id === item.treatmentId);
      return { ...item, treatment };
    }).filter(item => item.treatment);
  }, [cart, treatments]);

  // Cart actions
  const addToCart = (treatmentId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.treatmentId === treatmentId);
      if (existing) {
        return prev.map(item =>
          item.treatmentId === treatmentId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { treatmentId, quantity: 1 }];
    });
  };

  const increaseQuantity = (treatmentId: string) => {
    setCart(prev =>
      prev.map(item =>
        item.treatmentId === treatmentId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };

  const decreaseQuantity = (treatmentId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.treatmentId === treatmentId);
      if (existing && existing.quantity <= 1) {
        return prev.filter(item => item.treatmentId !== treatmentId);
      }
      return prev.map(item =>
        item.treatmentId === treatmentId
          ? { ...item, quantity: item.quantity - 1 }
          : item
      );
    });
  };

  const removeFromCart = (treatmentId: string) => {
    setCart(prev => prev.filter(item => item.treatmentId !== treatmentId));
  };

  // Flatten cart to treatment IDs for database insert
  const flattenedTreatmentIds = useMemo(() => {
    const ids: string[] = [];
    cart.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {
        ids.push(item.treatmentId);
      }
    });
    return ids;
  }, [cart]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const hotel = hotels?.find((h) => h.id === data.hotelId);
      const hairdresser = hairdressers?.find((h) => h.id === data.hairdresserId);
      
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

      if (data.treatmentIds.length > 0) {
        const treatmentRecords = data.treatmentIds.map((treatmentId: string) => ({
          booking_id: bookingData.id,
          treatment_id: treatmentId,
        }));

        const { error: treatmentsError } = await supabase
          .from("booking_treatments")
          .insert(treatmentRecords);

        if (treatmentsError) throw treatmentsError;
      }

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

  const validateStep1 = () => {
    if (!hotelId || !clientFirstName || !clientLastName || !phone || !date || !time) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (validateStep1()) {
      setCurrentStep(2);
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cart.length === 0) {
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
      treatmentIds: flattenedTreatmentIds,
      totalPrice,
      isAdmin,
    });
  };

  const handleClose = () => {
    setCurrentStep(1);
    setHotelId("");
    setClientFirstName("");
    setClientLastName("");
    setPhone("");
    setCountryCode("+33");
    setRoomNumber("");
    setDate(selectedDate);
    setTime(selectedTime || "");
    setHairdresserId("");
    setCart([]);
    setServiceFilter("all");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[950px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle>Créer une réservation</DialogTitle>
            {/* Stepper Indicator */}
            <div className="flex items-center gap-2 text-sm">
              <div className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium",
                currentStep === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                1
              </div>
              <span className={cn("text-xs", currentStep === 1 ? "font-medium" : "text-muted-foreground")}>
                Client
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <div className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium",
                currentStep === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                2
              </div>
              <span className={cn("text-xs", currentStep === 2 ? "font-medium" : "text-muted-foreground")}>
                Prestations
              </span>
            </div>
          </div>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          {/* Step 1: Logistics */}
          {currentStep === 1 && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Hotel */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Hôtel *</Label>
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

              {/* Client Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Prénom *</Label>
                  <Input
                    value={clientFirstName}
                    onChange={(e) => setClientFirstName(e.target.value)}
                    placeholder="Prénom du client"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Nom *</Label>
                  <Input
                    value={clientLastName}
                    onChange={(e) => setClientLastName(e.target.value)}
                    placeholder="Nom du client"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Téléphone *</Label>
                <div className="flex gap-2">
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-[110px] justify-between"
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
                    placeholder="Numéro de téléphone"
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Room & Date/Time */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Chambre</Label>
                  <Input
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="N° chambre"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Date *</Label>
                  <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "dd/MM/yyyy", { locale: fr }) : "Sélectionner"}
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
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Heure *</Label>
                  <Input
                    type="time"
                    step="600"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Hairdresser (Admin only) */}
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Coiffeur (optionnel)</Label>
                  <Select value={hairdresserId || "none"} onValueChange={(v) => setHairdresserId(v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Non assigné" />
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
          )}

          {/* Step 2: POS View */}
          {currentStep === 2 && (
            <div className="flex-1 overflow-hidden flex">
              {/* Left: Service Menu (70%) */}
              <div className="w-[70%] border-r flex flex-col">
                {/* Service Filter */}
                <div className="p-3 border-b flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Filtrer:</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={serviceFilter === "all" ? "default" : "outline"}
                      onClick={() => setServiceFilter("all")}
                      className="h-7 text-xs"
                    >
                      Tous
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={serviceFilter === "female" ? "default" : "outline"}
                      onClick={() => setServiceFilter("female")}
                      className="h-7 text-xs"
                    >
                      Femme
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={serviceFilter === "male" ? "default" : "outline"}
                      onClick={() => setServiceFilter("male")}
                      className="h-7 text-xs"
                    >
                      Homme
                    </Button>
                  </div>
                </div>

                {/* Treatment List */}
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {Object.entries(groupedTreatments).map(([category, items]) => (
                      <div key={category} className="mb-3">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1 bg-muted/50 rounded sticky top-0 z-10">
                          {category}
                        </div>
                        <div className="mt-1">
                          {items.map((treatment) => {
                            const cartItem = cart.find(c => c.treatmentId === treatment.id);
                            const quantity = cartItem?.quantity || 0;
                            return (
                              <div
                                key={treatment.id}
                                onClick={() => addToCart(treatment.id)}
                                className={cn(
                                  "flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-muted/40 transition-colors rounded text-sm group",
                                  quantity > 0 && "bg-primary/5"
                                )}
                              >
                                <span className="truncate flex-1 mr-2">{treatment.name}</span>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-xs text-muted-foreground">{treatment.duration}min</span>
                                  <span className="text-xs font-medium w-12 text-right">{treatment.price}€</span>
                                  {quantity > 0 ? (
                                    <span className="text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                      x{quantity}
                                    </span>
                                  ) : (
                                    <Plus className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {filteredTreatments.length === 0 && (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        {hotelId ? "Aucune prestation disponible" : "Sélectionnez un hôtel"}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: Cart (30%) */}
              <div className="w-[30%] flex flex-col bg-muted/20">
                <div className="p-3 border-b">
                  <h3 className="text-sm font-semibold">Panier ({cart.length})</h3>
                </div>
                
                <ScrollArea className="flex-1">
                  {cartWithDetails.length > 0 ? (
                    <div className="divide-y">
                      {cartWithDetails.map(({ treatmentId, quantity, treatment }) => (
                        <div key={treatmentId} className="p-2">
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <span className="text-sm font-medium leading-tight">{treatment!.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 shrink-0 -mt-0.5"
                              onClick={() => removeFromCart(treatmentId)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between">
                            {/* Quantity controls */}
                            <div className="flex items-center gap-1 border rounded">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => decreaseQuantity(treatmentId)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-sm font-medium w-6 text-center">{quantity}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => increaseQuantity(treatmentId)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">
                                {((treatment!.price || 0) * quantity).toFixed(0)}€
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {(treatment!.duration || 0) * quantity}min
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                      Panier vide
                    </div>
                  )}
                </ScrollArea>

                {/* Totals */}
                {cart.length > 0 && (
                  <div className="p-3 border-t bg-background">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Durée</span>
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
          )}

          {/* Footer */}
          <div className="p-3 border-t flex justify-between items-center bg-background">
            {currentStep === 1 ? (
              <>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Annuler
                </Button>
                <Button type="button" onClick={handleNextStep}>
                  Suivant: Prestations
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={handlePrevStep}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Retour
                </Button>
                <Button type="submit" disabled={createMutation.isPending || cart.length === 0}>
                  {createMutation.isPending ? "Création..." : "Créer la réservation"}
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
