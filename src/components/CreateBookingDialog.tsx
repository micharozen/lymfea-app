import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { Check, ChevronsUpDown, CalendarIcon, Plus, Minus, ArrowRight, Search } from "lucide-react";
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

interface CartItem { treatmentId: string; quantity: number; }

interface CreateBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date;
  selectedTime?: string;
}

export default function CreateBookingDialog({ open, onOpenChange, selectedDate, selectedTime }: CreateBookingDialogProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<1 | 2>(1);
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
  const [filter, setFilter] = useState<"all" | "female" | "male">("all");
  const [search, setSearch] = useState("");

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
  const { data: hotels } = useQuery({ queryKey: ["hotels"], queryFn: async () => { const { data } = await supabase.from("hotels").select("id, name").order("name"); return data || []; }});
  
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

  const filtered = useMemo(() => {
    if (!treatments) return [];
    let list = treatments.filter(t => filter === "all" || (filter === "female" ? (t.service_for === "Female" || t.service_for === "All") : (t.service_for === "Male" || t.service_for === "All")));
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(s));
    }
    return list;
  }, [treatments, filter, search]);

  const grouped = useMemo(() => {
    const g: Record<string, typeof filtered> = {};
    filtered.forEach(t => { const c = t.category || "Autres"; if (!g[c]) g[c] = []; g[c].push(t); });
    return g;
  }, [filtered]);

  const { totalPrice, totalDuration } = useMemo(() => {
    if (!treatments || !cart.length) return { totalPrice: 0, totalDuration: 0 };
    let p = 0, d = 0;
    cart.forEach(i => { const t = treatments.find(x => x.id === i.treatmentId); if (t) { p += (t.price || 0) * i.quantity; d += (t.duration || 0) * i.quantity; }});
    return { totalPrice: p, totalDuration: d };
  }, [cart, treatments]);

  const cartDetails = useMemo(() => cart.map(i => ({ ...i, t: treatments?.find(x => x.id === i.treatmentId) })).filter(i => i.t), [cart, treatments]);
  
  const add = (id: string) => setCart(p => { const e = p.find(x => x.treatmentId === id); return e ? p.map(x => x.treatmentId === id ? { ...x, quantity: x.quantity + 1 } : x) : [...p, { treatmentId: id, quantity: 1 }]; });
  const inc = (id: string) => setCart(p => p.map(x => x.treatmentId === id ? { ...x, quantity: x.quantity + 1 } : x));
  const dec = (id: string) => setCart(p => { const e = p.find(x => x.treatmentId === id); return e && e.quantity <= 1 ? p.filter(x => x.treatmentId !== id) : p.map(x => x.treatmentId === id ? { ...x, quantity: x.quantity - 1 } : x); });

  const flatIds = useMemo(() => { const ids: string[] = []; cart.forEach(i => { for (let j = 0; j < i.quantity; j++) ids.push(i.treatmentId); }); return ids; }, [cart]);

  const mutation = useMutation({
    mutationFn: async (d: any) => {
      const hotel = hotels?.find(h => h.id === d.hotelId);
      const hd = hairdressers?.find(h => h.id === d.hairdresserId);
      const { data: booking, error } = await supabase.from("bookings").insert({
        hotel_id: d.hotelId, hotel_name: hotel?.name || "", client_first_name: d.clientFirstName, client_last_name: d.clientLastName,
        phone: `${d.countryCode} ${d.phone}`, room_number: d.roomNumber, booking_date: d.date, booking_time: d.time,
        hairdresser_id: d.hairdresserId || null, hairdresser_name: hd ? `${hd.first_name} ${hd.last_name}` : null,
        status: d.hairdresserId ? "assigned" : "pending", assigned_at: d.hairdresserId ? new Date().toISOString() : null, total_price: d.totalPrice,
      }).select().single();
      if (error) throw error;
      if (d.treatmentIds.length) {
        const { error: te } = await supabase.from("booking_treatments").insert(d.treatmentIds.map((tid: string) => ({ booking_id: booking.id, treatment_id: tid })));
        if (te) throw te;
      }
      try { if (!d.isAdmin) await supabase.functions.invoke('notify-admin-new-booking', { body: { bookingId: booking.id } }); await supabase.functions.invoke('trigger-new-booking-notifications', { body: { bookingId: booking.id } }); } catch {}
      return booking;
    },
    onSuccess: () => { toast({ title: "Réservation créée" }); queryClient.invalidateQueries({ queryKey: ["bookings"] }); close(); },
    onError: () => { toast({ title: "Erreur", variant: "destructive" }); },
  });

  const validate = () => {
    if (!hotelId || !clientFirstName || !clientLastName || !phone || !date || !time) { toast({ title: "Champs requis", variant: "destructive" }); return false; }
    return true;
  };

  const next = () => { if (validate()) setView(2); };
  const back = () => setView(1);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cart.length) { toast({ title: "Sélectionnez une prestation", variant: "destructive" }); return; }
    mutation.mutate({ hotelId, clientFirstName, clientLastName, phone, countryCode, roomNumber, date: date ? format(date, "yyyy-MM-dd") : "", time, hairdresserId, treatmentIds: flatIds, totalPrice, isAdmin });
  };
  const close = () => { setView(1); setHotelId(""); setClientFirstName(""); setClientLastName(""); setPhone(""); setCountryCode("+33"); setRoomNumber(""); setDate(selectedDate); setTime(selectedTime || ""); setHairdresserId(""); setCart([]); setFilter("all"); setSearch(""); onOpenChange(false); };

  const hotel = hotels?.find(h => h.id === hotelId);
  const itemCount = cart.reduce((s, c) => s + c.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "p-0 gap-0 flex flex-col overflow-hidden",
        view === 1 ? "sm:max-w-[480px]" : "sm:max-w-[700px] h-[80vh] max-h-[800px]"
      )}>
        {/* ══════════════════════════════════════════════════════════════════
            VIEW 1: CLIENT & CONTEXT FORM
        ══════════════════════════════════════════════════════════════════ */}
        {view === 1 && (
          <div className="flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Nouvelle réservation</h2>
              <p className="text-sm text-muted-foreground">Informations client et contexte</p>
            </div>

            {/* Form Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Row 1: Hotel */}
              <div>
                <Label className="text-sm font-medium">Hôtel *</Label>
                <Select value={hotelId} onValueChange={setHotelId}>
                  <SelectTrigger className="mt-1.5 h-10">
                    <SelectValue placeholder="Sélectionner un hôtel" />
                  </SelectTrigger>
                  <SelectContent>
                    {hotels?.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Row 2: First Name / Last Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Prénom *</Label>
                  <Input value={clientFirstName} onChange={e => setClientFirstName(e.target.value)} className="mt-1.5 h-10" placeholder="Prénom" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Nom *</Label>
                  <Input value={clientLastName} onChange={e => setClientLastName(e.target.value)} className="mt-1.5 h-10" placeholder="Nom" />
                </div>
              </div>

              {/* Row 3: Phone */}
              <div>
                <Label className="text-sm font-medium">Téléphone *</Label>
                <div className="flex gap-2 mt-1.5">
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-24 h-10 px-2 justify-between font-normal">
                        {countries.find(c => c.code === countryCode)?.flag} {countryCode}
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-0">
                      <Command>
                        <CommandInput placeholder="Rechercher..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>Non trouvé</CommandEmpty>
                          <CommandGroup>
                            {countries.map(c => (
                              <CommandItem key={c.code} value={c.code} onSelect={() => { setCountryCode(c.code); setCountryOpen(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", countryCode === c.code ? "opacity-100" : "opacity-0")} />
                                {c.flag} {c.label} ({c.code})
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Input 
                    value={phone} 
                    onChange={e => setPhone(formatPhoneNumber(e.target.value, countryCode))} 
                    className="flex-1 h-10" 
                    placeholder="Numéro de téléphone" 
                  />
                </div>
              </div>

              {/* Row 4: Room */}
              <div>
                <Label className="text-sm font-medium">Chambre</Label>
                <Input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} className="mt-1.5 h-10" placeholder="N° chambre" />
              </div>

              {/* Row 5: Date / Time - same height and aligned */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Date *</Label>
                  <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1.5 h-10 justify-start font-normal hover:bg-transparent hover:text-foreground", !date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "dd/MM/yyyy", { locale: fr }) : "Sélectionner une date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={date} onSelect={d => { setDate(d); setDatePopoverOpen(false); }} initialFocus locale={fr} className="pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-sm font-medium">Heure *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1.5 h-10 justify-start font-normal hover:bg-transparent hover:text-foreground", !time && "text-muted-foreground")}>
                        {time || "Sélectionner l'heure"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <div className="grid grid-cols-6 gap-1">
                        {Array.from({ length: 17 }, (_, h) => h + 7).map(hour => (
                          <div key={hour} className="space-y-1">
                            <div className="text-xs font-medium text-center text-muted-foreground pb-1">{hour}h</div>
                            {[0, 10, 20, 30, 40, 50].map(min => {
                              const timeValue = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                              return (
                                <button
                                  key={timeValue}
                                  type="button"
                                  onClick={() => setTime(timeValue)}
                                  className={cn(
                                    "w-full text-xs py-1 px-1 rounded transition-colors",
                                    time === timeValue 
                                      ? "bg-primary text-primary-foreground" 
                                      : "hover:bg-muted"
                                  )}
                                >
                                  :{min.toString().padStart(2, '0')}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Row 5: Hairdresser (Admin only) */}
              {isAdmin && (
                <div>
                  <Label className="text-sm font-medium">Coiffeur / Staff</Label>
                  <Select value={hairdresserId || "none"} onValueChange={v => setHairdresserId(v === "none" ? "" : v)}>
                    <SelectTrigger className="mt-1.5 h-10">
                      <SelectValue placeholder="Non assigné" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non assigné</SelectItem>
                      {hairdressers?.map(h => <SelectItem key={h.id} value={h.id}>{h.first_name} {h.last_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center justify-between bg-muted/30">
              <Button type="button" variant="ghost" onClick={close}>Annuler</Button>
              <Button type="button" onClick={next} className="bg-foreground text-background hover:bg-foreground/90">
                Services <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* VIEW 2: MINIMALIST SPA MENU */}
        {view === 2 && (
          <form onSubmit={submit} className="flex flex-col h-full min-h-[500px] max-h-[80vh] bg-background">
            
            {/* 1. SCROLLABLE SERVICE LIST */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              
              {/* HEADER: Tabs + Back */}
              <div className="sticky top-0 bg-background z-10 border-b border-border/50">
                {/* Back Button Row */}
                <div className="px-4 py-2 flex items-center">
                  <button 
                    type="button" 
                    onClick={back}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Retour
                  </button>
                </div>
                
                {/* Menu Tabs (Clean Underline Style) */}
                <div className="px-4 flex items-center gap-6">
                  {(["female", "male"] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={cn(
                        "pb-2 text-[10px] font-bold uppercase tracking-widest transition-colors",
                        filter === f 
                          ? "text-foreground border-b-2 border-foreground" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {f === "female" ? "WOMEN'S MENU" : "MEN'S MENU"}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <div className="relative w-32 pb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input 
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search..."
                      className="h-6 pl-7 text-xs border-border/50"
                    />
                  </div>
                </div>
              </div>

              {/* SERVICE LIST */}
              <div className="px-4 py-2">
                {Object.entries(grouped).map(([category, items]) => (
                  <div key={category} className="mb-4">
                    {/* Category Header */}
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 pb-1 border-b border-border/30">
                      {category}
                    </h3>
                    
                    {/* Clean Service Rows - HIGH DENSITY */}
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
                            onClick={() => add(treatment.id)}
                            className="bg-foreground text-background text-[10px] font-bold uppercase tracking-wide h-6 px-3 rounded-full hover:bg-foreground/80 transition-colors shrink-0"
                          >
                            Select
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {!filtered.length && (
                  <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
                    No treatments found
                  </div>
                )}
              </div>
            </div>

            {/* 2. COMPACT STICKY FOOTER */}
            <div className="shrink-0 border-t border-border bg-background z-20">
              
              {/* Single Row: Cart Summary + Total + Button */}
              <div className="px-4 py-2 flex items-center gap-3">
                
                {/* Left: Cart Items (Compact inline) */}
                <div className="flex-1 min-w-0">
                  {cart.length > 0 ? (
                    <div className="flex items-center gap-2 overflow-x-auto">
                      {cartDetails.slice(0, 3).map(({ treatmentId, quantity, t }) => (
                        <div key={treatmentId} className="flex items-center gap-1 bg-muted/50 rounded px-2 py-1 shrink-0">
                          <span className="text-[10px] font-medium truncate max-w-[80px]">{t!.name}</span>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => dec(treatmentId)} className="p-0.5 hover:text-destructive text-muted-foreground">
                              <Minus className="h-2.5 w-2.5" />
                            </button>
                            <span className="text-[10px] font-bold w-3 text-center">{quantity}</span>
                            <button type="button" onClick={() => add(treatmentId)} className="p-0.5 hover:text-foreground text-muted-foreground">
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {cartDetails.length > 3 && (
                        <span className="text-[10px] text-muted-foreground shrink-0">+{cartDetails.length - 3}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Aucun service</span>
                  )}
                </div>

                {/* Right: Total + Submit */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-sm">{totalPrice}€</span>
                  <Button 
                    type="submit" 
                    disabled={mutation.isPending || cart.length === 0} 
                    size="sm"
                    className="bg-foreground text-background hover:bg-foreground/90 h-8 px-4"
                  >
                    {mutation.isPending ? "..." : "Créer"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
