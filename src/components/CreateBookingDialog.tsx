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
        view === 1 ? "sm:max-w-[480px]" : "sm:max-w-[900px] h-[85vh] max-h-[700px]"
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

              {/* Row 4: Room / Date / Time */}
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-2">
                  <Label className="text-sm font-medium">Chambre</Label>
                  <Input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} className="mt-1.5 h-10" placeholder="N° chambre" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Date *</Label>
                  <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1.5 h-10 justify-start font-normal", !date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "dd/MM", { locale: fr }) : "Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={date} onSelect={d => { setDate(d); setDatePopoverOpen(false); }} initialFocus locale={fr} className="pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-sm font-medium">Heure *</Label>
                  <Input type="time" step="600" value={time} onChange={e => setTime(e.target.value)} className="mt-1.5 h-10" />
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

        {/* ══════════════════════════════════════════════════════════════════
            VIEW 2: SERVICES & CART (POS INTERFACE)
        ══════════════════════════════════════════════════════════════════ */}
        {view === 2 && (
          <form onSubmit={submit} className="flex flex-col h-full">
            {/* Header Badge */}
            <div className="h-12 px-4 flex items-center justify-between border-b bg-muted/40 shrink-0">
              <div className="flex items-center gap-3">
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={back}>
                  ← Retour
                </Button>
                <div className="h-5 w-px bg-border" />
                <span className="text-sm font-medium">{clientFirstName} {clientLastName}</span>
                {roomNumber && <span className="text-sm text-muted-foreground">• Chambre {roomNumber}</span>}
                <span className="text-sm text-muted-foreground">• {hotel?.name}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {date ? format(date, "dd MMM", { locale: fr }) : ""} à {time}
              </span>
            </div>

            {/* Single Column Layout */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* SECTION A: Service List (Top) */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Tabs + Search */}
                <div className="h-11 px-3 flex items-center gap-2 border-b shrink-0">
                  <div className="flex items-center gap-1">
                    {(["all", "female", "male"] as const).map(f => (
                      <Button 
                        key={f} 
                        type="button" 
                        variant={filter === f ? "secondary" : "ghost"} 
                        size="sm" 
                        className="h-7 text-xs px-3"
                        onClick={() => setFilter(f)}
                      >
                        {f === "all" ? "Tous" : f === "female" ? "Femmes" : "Hommes"}
                      </Button>
                    ))}
                  </div>
                  <div className="flex-1" />
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input 
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Rechercher..."
                      className="h-7 pl-8 text-xs"
                    />
                  </div>
                </div>

                {/* Service List */}
                <ScrollArea className="flex-1">
                  {Object.entries(grouped).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="h-7 px-3 flex items-center bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
                        {cat}
                      </div>
                      {items.map(t => {
                        const qty = cart.find(c => c.treatmentId === t.id)?.quantity || 0;
                        return (
                          <div 
                            key={t.id} 
                            onClick={() => add(t.id)} 
                            className={cn(
                              "h-10 flex items-center px-3 cursor-pointer border-b border-border/30 hover:bg-muted/40 transition-colors",
                              qty > 0 && "bg-primary/5"
                            )}
                          >
                            <span className="flex-1 text-sm truncate">{t.name}</span>
                            <span className="w-16 text-right text-xs text-muted-foreground">{t.duration} min</span>
                            <span className="w-16 text-right text-sm font-medium">{t.price}€</span>
                            <div className="w-10 flex justify-end">
                              {qty > 0 ? (
                                <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">×{qty}</span>
                              ) : (
                                <Plus className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {!filtered.length && (
                    <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                      Aucune prestation trouvée
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* ═══════════════════════════════════════════════════════════
                  SECTION B: RÉCAPITULATIF (Bottom - Sticky)
              ═══════════════════════════════════════════════════════════ */}
              {cart.length > 0 && (
                <div className="shrink-0 border-t-2 border-border">
                  {/* Section Header */}
                  <div className="h-10 px-4 flex items-center bg-muted/60 border-b border-border/50">
                    <span className="text-sm font-semibold">Récapitulatif</span>
                    <div className="flex-1" />
                    <span className="text-xs text-muted-foreground mr-4">{totalDuration} min</span>
                    <span className="text-base font-bold">{totalPrice}€</span>
                  </div>

                  {/* Selected Items List */}
                  <div className="max-h-40 overflow-y-auto bg-background">
                    {cartDetails.map(({ treatmentId, quantity, t }) => (
                      <div key={treatmentId} className="h-11 flex items-center px-4 border-b border-border/30">
                        <span className="flex-1 text-sm truncate pr-2">{t!.name}</span>
                        
                        {/* Qty Controls: [ - qty + ] */}
                        <div className="flex items-center shrink-0 border border-border rounded-md bg-muted/30">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 rounded-none rounded-l-md hover:bg-muted"
                            onClick={() => dec(treatmentId)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 rounded-none rounded-r-md hover:bg-muted"
                            onClick={() => inc(treatmentId)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>

                        <span className="w-20 text-right text-sm font-medium">{((t!.price || 0) * quantity)}€</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="h-14 px-4 flex items-center justify-between border-t bg-background shrink-0">
              <Button type="button" variant="outline" onClick={back}>
                ← Retour
              </Button>
              <Button 
                type="submit" 
                disabled={mutation.isPending || !cart.length}
                className="bg-foreground text-background hover:bg-foreground/90 px-6"
              >
                {mutation.isPending ? "Création..." : "Créer la réservation"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
