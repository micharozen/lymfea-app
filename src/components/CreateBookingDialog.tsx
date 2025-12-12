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
import { Check, ChevronsUpDown, CalendarIcon, X, Plus, Minus, ArrowRight, ArrowLeft, User, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

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
  
  const [currentStep, setCurrentStep] = useState(1);
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
      const { data, error } = await supabase.from("hotels").select("id, name").order("name");
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
        .select(`hairdresser_id, hairdressers (id, first_name, last_name, status)`)
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

  const { totalPrice, totalDuration } = useMemo(() => {
    if (!treatments || cart.length === 0) return { totalPrice: 0, totalDuration: 0 };
    let price = 0, duration = 0;
    cart.forEach(item => {
      const treatment = treatments.find(t => t.id === item.treatmentId);
      if (treatment) {
        price += (treatment.price || 0) * item.quantity;
        duration += (treatment.duration || 0) * item.quantity;
      }
    });
    return { totalPrice: price, totalDuration: duration };
  }, [cart, treatments]);

  const cartWithDetails = useMemo(() => {
    if (!treatments) return [];
    return cart.map(item => {
      const treatment = treatments.find(t => t.id === item.treatmentId);
      return { ...item, treatment };
    }).filter(item => item.treatment);
  }, [cart, treatments]);

  const addToCart = (treatmentId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.treatmentId === treatmentId);
      if (existing) {
        return prev.map(item => item.treatmentId === treatmentId ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { treatmentId, quantity: 1 }];
    });
  };

  const increaseQuantity = (treatmentId: string) => {
    setCart(prev => prev.map(item => item.treatmentId === treatmentId ? { ...item, quantity: item.quantity + 1 } : item));
  };

  const decreaseQuantity = (treatmentId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.treatmentId === treatmentId);
      if (existing && existing.quantity <= 1) {
        return prev.filter(item => item.treatmentId !== treatmentId);
      }
      return prev.map(item => item.treatmentId === treatmentId ? { ...item, quantity: item.quantity - 1 } : item);
    });
  };

  const flattenedTreatmentIds = useMemo(() => {
    const ids: string[] = [];
    cart.forEach(item => { for (let i = 0; i < item.quantity; i++) ids.push(item.treatmentId); });
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
        const { error: treatmentsError } = await supabase.from("booking_treatments").insert(treatmentRecords);
        if (treatmentsError) throw treatmentsError;
      }

      try {
        if (!data.isAdmin) {
          await supabase.functions.invoke('notify-admin-new-booking', { body: { bookingId: bookingData.id } });
        }
        await supabase.functions.invoke('trigger-new-booking-notifications', { body: { bookingId: bookingData.id } });
      } catch (notifError) {
        console.error('Error triggering notifications:', notifError);
      }
      return bookingData;
    },
    onSuccess: () => {
      toast({ title: "Réservation créée", description: "La réservation a été créée avec succès." });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      handleClose();
    },
    onError: (error) => {
      toast({ title: "Erreur", description: "Une erreur est survenue lors de la création de la réservation.", variant: "destructive" });
      console.error("Error creating booking:", error);
    },
  });

  const validateStep1 = () => {
    if (!hotelId || !clientFirstName || !clientLastName || !phone || !date || !time) {
      toast({ title: "Champs requis", description: "Veuillez remplir tous les champs obligatoires.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleNextStep = () => { if (validateStep1()) setCurrentStep(2); };
  const handlePrevStep = () => { setCurrentStep(1); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast({ title: "Prestation requise", description: "Veuillez sélectionner au moins une prestation.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      hotelId, clientFirstName, clientLastName, phone, countryCode, roomNumber,
      date: date ? format(date, "yyyy-MM-dd") : "", time, hairdresserId,
      treatmentIds: flattenedTreatmentIds, totalPrice, isAdmin,
    });
  };

  const handleClose = () => {
    setCurrentStep(1);
    setHotelId(""); setClientFirstName(""); setClientLastName("");
    setPhone(""); setCountryCode("+33"); setRoomNumber("");
    setDate(selectedDate); setTime(selectedTime || "");
    setHairdresserId(""); setCart([]); setServiceFilter("all");
    onOpenChange(false);
  };

  const selectedHotel = hotels?.find(h => h.id === hotelId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] h-[85vh] max-h-[700px] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-4 py-2 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">Nouvelle réservation</DialogTitle>
            <div className="flex items-center gap-1.5 text-xs">
              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold", currentStep === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>1</div>
              <span className={cn(currentStep === 1 ? "font-medium" : "text-muted-foreground")}>Client</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground mx-1" />
              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold", currentStep === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>2</div>
              <span className={cn(currentStep === 2 ? "font-medium" : "text-muted-foreground")}>Services</span>
            </div>
          </div>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* STEP 1: Client Info */}
          {currentStep === 1 && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Hôtel *</Label>
                  <Select value={hotelId} onValueChange={setHotelId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>{hotels?.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Chambre</Label>
                  <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="N°" className="h-9" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Prénom *</Label>
                  <Input value={clientFirstName} onChange={(e) => setClientFirstName(e.target.value)} placeholder="Prénom" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nom *</Label>
                  <Input value={clientLastName} onChange={(e) => setClientLastName(e.target.value)} placeholder="Nom" className="h-9" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Téléphone *</Label>
                <div className="flex gap-2">
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-24 h-9 justify-between text-xs px-2">
                        {countries.find((c) => c.code === countryCode)?.flag} {countryCode}
                        <ChevronsUpDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[180px] p-0">
                      <Command>
                        <CommandInput placeholder="Rechercher..." className="h-8" />
                        <CommandList>
                          <CommandEmpty>Aucun pays.</CommandEmpty>
                          <CommandGroup>
                            {countries.map((c) => (
                              <CommandItem key={c.code} value={c.code} onSelect={() => { setCountryCode(c.code); setCountryOpen(false); }}>
                                <Check className={cn("mr-2 h-3 w-3", countryCode === c.code ? "opacity-100" : "opacity-0")} />
                                {c.flag} {c.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Input value={phone} onChange={(e) => setPhone(formatPhoneNumber(e.target.value, countryCode))} placeholder="Numéro" className="flex-1 h-9" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date *</Label>
                  <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full h-9 justify-start text-left text-xs", !date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {date ? format(date, "dd/MM/yyyy", { locale: fr }) : "Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={date} onSelect={(d) => { setDate(d); setDatePopoverOpen(false); }} initialFocus locale={fr} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Heure *</Label>
                  <Input type="time" step="600" value={time} onChange={(e) => setTime(e.target.value)} className="h-9" />
                </div>
              </div>

              {isAdmin && (
                <div className="space-y-1">
                  <Label className="text-xs">Coiffeur</Label>
                  <Select value={hairdresserId || "none"} onValueChange={(v) => setHairdresserId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Non assigné" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non assigné</SelectItem>
                      {hairdressers?.map((h) => <SelectItem key={h.id} value={h.id}>{h.first_name} {h.last_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: POS View - Full Height */}
          {currentStep === 2 && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Context Badge */}
              <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-3 text-xs shrink-0">
                <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                  <User className="h-2.5 w-2.5" />
                  {clientFirstName} {clientLastName}
                </Badge>
                {roomNumber && <Badge variant="outline" className="text-[10px] h-5">Ch. {roomNumber}</Badge>}
                <Badge variant="outline" className="text-[10px] h-5">{selectedHotel?.name}</Badge>
                <Badge variant="outline" className="gap-1 text-[10px] h-5">
                  <Clock className="h-2.5 w-2.5" />
                  {date ? format(date, "dd/MM", { locale: fr }) : ""} {time}
                </Badge>
                <Button type="button" variant="ghost" size="sm" className="h-5 text-[10px] ml-auto px-2" onClick={handlePrevStep}>
                  Modifier
                </Button>
              </div>

              {/* Split View */}
              <div className="flex-1 flex min-h-0">
                {/* LEFT: Menu (60%) */}
                <div className="w-[60%] border-r flex flex-col min-h-0">
                  <div className="px-2 py-1.5 border-b flex items-center gap-1 shrink-0">
                    {(["all", "female", "male"] as const).map((f) => (
                      <Button key={f} type="button" size="sm" variant={serviceFilter === f ? "default" : "ghost"} onClick={() => setServiceFilter(f)} className="h-6 text-[10px] px-2">
                        {f === "all" ? "Tous" : f === "female" ? "Femme" : "Homme"}
                      </Button>
                    ))}
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="text-xs">
                      {Object.entries(groupedTreatments).map(([category, items]) => (
                        <div key={category}>
                          <div className="px-2 py-1 bg-muted/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10">{category}</div>
                          {items.map((t) => {
                            const qty = cart.find(c => c.treatmentId === t.id)?.quantity || 0;
                            return (
                              <div
                                key={t.id}
                                onClick={() => addToCart(t.id)}
                                className={cn(
                                  "h-9 flex items-center px-2 cursor-pointer hover:bg-muted/40 border-b border-border/30",
                                  qty > 0 && "bg-primary/5"
                                )}
                              >
                                <span className="flex-1 truncate pr-2">{t.name}</span>
                                <span className="text-muted-foreground w-12 text-right">{t.duration}′</span>
                                <span className="font-medium w-14 text-right">{t.price}€</span>
                                <div className="w-8 flex justify-end">
                                  {qty > 0 ? (
                                    <span className="text-[10px] font-bold text-primary">×{qty}</span>
                                  ) : (
                                    <Plus className="h-3.5 w-3.5 text-primary" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {filteredTreatments.length === 0 && (
                        <div className="p-6 text-center text-xs text-muted-foreground">Aucune prestation</div>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* RIGHT: Cart (40%) - Receipt Style */}
                <div className="w-[40%] flex flex-col min-h-0 bg-muted/10">
                  <div className="px-2 py-1.5 border-b text-xs font-semibold shrink-0">
                    Ticket ({cart.reduce((s, c) => s + c.quantity, 0)})
                  </div>
                  <ScrollArea className="flex-1">
                    {cartWithDetails.length > 0 ? (
                      <div className="text-xs">
                        {cartWithDetails.map(({ treatmentId, quantity, treatment }) => (
                          <div key={treatmentId} className="h-8 flex items-center gap-1 px-1.5 border-b border-dashed border-border/40">
                            {/* Qty Controls */}
                            <div className="flex items-center shrink-0">
                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => decreaseQuantity(treatmentId)}>
                                <Minus className="h-2.5 w-2.5" />
                              </Button>
                              <span className="w-4 text-center font-medium text-[11px]">{quantity}</span>
                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => increaseQuantity(treatmentId)}>
                                <Plus className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                            <span className="flex-1 truncate text-[11px]">{treatment!.name}</span>
                            <span className="font-medium shrink-0 text-[11px]">{((treatment!.price || 0) * quantity).toFixed(0)}€</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">Panier vide</div>
                    )}
                  </ScrollArea>
                  {/* Totals */}
                  {cart.length > 0 && (
                    <div className="px-2 py-2 border-t border-dashed bg-background shrink-0">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Durée</span>
                        <span>{totalDuration} min</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold mt-0.5">
                        <span>TOTAL</span>
                        <span className="text-primary">{totalPrice}€</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-3 py-2 border-t flex justify-between items-center shrink-0">
            {currentStep === 1 ? (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={handleClose}>Annuler</Button>
                <Button type="button" size="sm" onClick={handleNextStep}>
                  Suivant <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={handlePrevStep}>
                  <ArrowLeft className="mr-1 h-3 w-3" /> Retour
                </Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending || cart.length === 0}>
                  {createMutation.isPending ? "Création..." : "Créer"}
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
