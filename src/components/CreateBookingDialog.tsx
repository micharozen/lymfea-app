import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Check, ChevronsUpDown, CalendarIcon, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface CartItem { treatmentId: string; quantity: number; }

interface CreateBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date;
  selectedTime?: string;
}

export default function CreateBookingDialog({ open, onOpenChange, selectedDate, selectedTime }: CreateBookingDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"info" | "prestations">("info");
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [treatmentFilter, setTreatmentFilter] = useState<"female" | "male">("female");
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (selectedDate) setDate(selectedDate);
    if (selectedTime) setTime(selectedTime);
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
      const { data } = await supabase.from("hotels").select("id, name").order("name"); 
      return data || []; 
    }
  });
  
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
      const { data: booking, error } = await supabase.from("bookings").insert({
        hotel_id: d.hotelId, 
        hotel_name: hotel?.name || "", 
        client_first_name: d.clientFirstName, 
        client_last_name: d.clientLastName,
        phone: `${d.countryCode} ${d.phone}`, 
        room_number: d.roomNumber, 
        booking_date: d.date, 
        booking_time: d.time,
        hairdresser_id: d.hairdresserId || null, 
        hairdresser_name: hd ? `${hd.first_name} ${hd.last_name}` : null,
        status: d.hairdresserId ? "Assigné" : "En attente", 
        assigned_at: d.hairdresserId ? new Date().toISOString() : null, 
        total_price: d.totalPrice,
      }).select().single();
      
      if (error) throw error;
      
      if (d.treatmentIds.length) {
        const { error: te } = await supabase.from("booking_treatments").insert(
          d.treatmentIds.map((tid: string) => ({ booking_id: booking.id, treatment_id: tid }))
        );
        if (te) throw te;
      }
      
      try { 
        if (!d.isAdmin) await supabase.functions.invoke('notify-admin-new-booking', { body: { bookingId: booking.id } }); 
        await supabase.functions.invoke('trigger-new-booking-notifications', { body: { bookingId: booking.id } }); 
      } catch {}
      
      return booking;
    },
    onSuccess: () => { 
      toast({ title: "Réservation créée" }); 
      queryClient.invalidateQueries({ queryKey: ["bookings"] }); 
      handleClose(); 
    },
    onError: () => { 
      toast({ title: "Erreur", variant: "destructive" }); 
    },
  });

  const validateInfo = () => {
    if (!hotelId || !clientFirstName || !clientLastName || !phone || !date || !time) { 
      toast({ title: "Champs requis", description: "Veuillez remplir tous les champs obligatoires.", variant: "destructive" }); 
      return false; 
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cart.length) { 
      toast({ title: "Sélectionnez une prestation", variant: "destructive" }); 
      return; 
    }
    mutation.mutate({ 
      hotelId, 
      clientFirstName, 
      clientLastName, 
      phone, 
      countryCode, 
      roomNumber, 
      date: date ? format(date, "yyyy-MM-dd") : "", 
      time, 
      hairdresserId, 
      treatmentIds: flatIds, 
      totalPrice, 
      isAdmin 
    });
  };
  
  const handleClose = () => { 
    setActiveTab("info"); 
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
    setTreatmentFilter("female"); 
    onOpenChange(false); 
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-lg font-semibold">
            Nouvelle réservation
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "info" | "prestations")} className="flex-1 flex flex-col min-h-0">
            <TabsContent value="info" className="flex-1 px-6 py-4 space-y-3 mt-0 data-[state=inactive]:hidden">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Hôtel *</Label>
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
                  <Label className="text-xs">Date *</Label>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full h-9 justify-start text-left font-normal hover:bg-background",
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
                  <Input
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
                  <Label className="text-xs">Prénom *</Label>
                  <Input
                    value={clientFirstName}
                    onChange={(e) => setClientFirstName(e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Nom *</Label>
                  <Input
                    value={clientLastName}
                    onChange={(e) => setClientLastName(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Téléphone *</Label>
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
                  <Label className="text-xs">Numéro de chambre</Label>
                  <Input
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {isAdmin && (
                <div className="space-y-1">
                  <Label className="text-xs">Coiffeur / Prestataire</Label>
                  <Select 
                    value={hairdresserId || "none"} 
                    onValueChange={(value) => setHairdresserId(value === "none" ? "" : value)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sélectionner un coiffeur" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg">
                      <SelectItem value="none">Aucun coiffeur</SelectItem>
                      {hairdressers?.map((hairdresser) => (
                        <SelectItem key={hairdresser.id} value={hairdresser.id}>
                          {hairdresser.first_name} {hairdresser.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-between gap-3 pt-4 mt-4 border-t shrink-0">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Annuler
                </Button>
                <Button type="button" onClick={() => { if (validateInfo()) setActiveTab("prestations"); }}>
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
                      disabled={mutation.isPending || cart.length === 0} 
                      size="sm"
                      className="bg-foreground text-background hover:bg-foreground/90 h-7 text-xs px-3"
                    >
                      {mutation.isPending ? "..." : "Créer"}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </form>
      </DialogContent>
    </Dialog>
  );
}
