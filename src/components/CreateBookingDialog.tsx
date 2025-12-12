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
import { Check, ChevronsUpDown, CalendarIcon, Plus, Minus, ArrowRight, ArrowLeft, ChevronLeft } from "lucide-react";
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
  const [step, setStep] = useState(1);
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
    return treatments.filter(t => filter === "all" || (filter === "female" ? (t.service_for === "Female" || t.service_for === "All") : (t.service_for === "Male" || t.service_for === "All")));
  }, [treatments, filter]);

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

  const next = () => { if (validate()) setStep(2); };
  const back = () => setStep(1);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cart.length) { toast({ title: "Sélectionnez une prestation", variant: "destructive" }); return; }
    mutation.mutate({ hotelId, clientFirstName, clientLastName, phone, countryCode, roomNumber, date: date ? format(date, "yyyy-MM-dd") : "", time, hairdresserId, treatmentIds: flatIds, totalPrice, isAdmin });
  };
  const close = () => { setStep(1); setHotelId(""); setClientFirstName(""); setClientLastName(""); setPhone(""); setCountryCode("+33"); setRoomNumber(""); setDate(selectedDate); setTime(selectedTime || ""); setHairdresserId(""); setCart([]); setFilter("all"); onOpenChange(false); };

  const hotel = hotels?.find(h => h.id === hotelId);
  const itemCount = cart.reduce((s, c) => s + c.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px] h-[80vh] max-h-[640px] p-0 gap-0 flex flex-col overflow-hidden">
        {/* STEP 1: Client Form */}
        {step === 1 && (
          <>
            <div className="h-10 px-3 flex items-center border-b text-sm font-medium shrink-0">Nouvelle réservation</div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[11px]">Hôtel *</Label><Select value={hotelId} onValueChange={setHotelId}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent>{hotels?.map(h => <SelectItem key={h.id} value={h.id} className="text-xs">{h.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-[11px]">Chambre</Label><Input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} className="h-8 text-xs" placeholder="N°" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[11px]">Prénom *</Label><Input value={clientFirstName} onChange={e => setClientFirstName(e.target.value)} className="h-8 text-xs" /></div>
                <div><Label className="text-[11px]">Nom *</Label><Input value={clientLastName} onChange={e => setClientLastName(e.target.value)} className="h-8 text-xs" /></div>
              </div>
              <div><Label className="text-[11px]">Téléphone *</Label>
                <div className="flex gap-1.5">
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}><PopoverTrigger asChild><Button variant="outline" className="w-20 h-8 text-[11px] px-1.5 justify-between">{countries.find(c => c.code === countryCode)?.flag} {countryCode}<ChevronsUpDown className="h-2.5 w-2.5 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-40 p-0"><Command><CommandInput placeholder="..." className="h-7 text-xs" /><CommandList><CommandEmpty>-</CommandEmpty><CommandGroup>{countries.map(c => <CommandItem key={c.code} value={c.code} onSelect={() => { setCountryCode(c.code); setCountryOpen(false); }} className="text-xs"><Check className={cn("mr-1.5 h-3 w-3", countryCode === c.code ? "opacity-100" : "opacity-0")} />{c.flag} {c.label}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>
                  <Input value={phone} onChange={e => setPhone(formatPhoneNumber(e.target.value, countryCode))} className="flex-1 h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[11px]">Date *</Label><Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}><PopoverTrigger asChild><Button variant="outline" className={cn("w-full h-8 justify-start text-xs", !date && "text-muted-foreground")}><CalendarIcon className="mr-1.5 h-3 w-3" />{date ? format(date, "dd/MM/yy", { locale: fr }) : "..."}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={date} onSelect={d => { setDate(d); setDatePopoverOpen(false); }} initialFocus locale={fr} /></PopoverContent></Popover></div>
                <div><Label className="text-[11px]">Heure *</Label><Input type="time" step="600" value={time} onChange={e => setTime(e.target.value)} className="h-8 text-xs" /></div>
              </div>
              {isAdmin && <div><Label className="text-[11px]">Coiffeur</Label><Select value={hairdresserId || "none"} onValueChange={v => setHairdresserId(v === "none" ? "" : v)}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Non assigné" /></SelectTrigger><SelectContent><SelectItem value="none" className="text-xs">Non assigné</SelectItem>{hairdressers?.map(h => <SelectItem key={h.id} value={h.id} className="text-xs">{h.first_name} {h.last_name}</SelectItem>)}</SelectContent></Select></div>}
            </div>
            <div className="h-11 px-3 flex items-center justify-between border-t shrink-0">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={close}>Annuler</Button>
              <Button type="button" size="sm" className="h-7 text-xs" onClick={next}>Services <ArrowRight className="ml-1 h-3 w-3" /></Button>
            </div>
          </>
        )}

        {/* STEP 2: POS View */}
        {step === 2 && (
          <form onSubmit={submit} className="flex flex-col h-full">
            {/* Header Badge */}
            <div className="h-9 px-2 flex items-center gap-2 border-b bg-muted/40 text-[11px] shrink-0">
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={back}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span className="font-medium">{clientFirstName} {clientLastName}</span>
              {roomNumber && <span className="text-muted-foreground">• Ch.{roomNumber}</span>}
              <span className="text-muted-foreground">• {hotel?.name}</span>
              <span className="text-muted-foreground ml-auto">{date ? format(date, "dd/MM", { locale: fr }) : ""} {time}</span>
            </div>

            {/* POS Split */}
            <div className="flex-1 flex min-h-0">
              {/* LEFT: Menu 60% */}
              <div className="w-[60%] flex flex-col border-r min-h-0">
                <div className="h-8 px-1.5 flex items-center gap-0.5 border-b shrink-0">
                  {(["all", "female", "male"] as const).map(f => (
                    <Button key={f} type="button" variant={filter === f ? "secondary" : "ghost"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setFilter(f)}>
                      {f === "all" ? "Tous" : f === "female" ? "F" : "H"}
                    </Button>
                  ))}
                </div>
                <ScrollArea className="flex-1">
                  {Object.entries(grouped).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="h-6 px-2 flex items-center bg-muted/50 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10">{cat}</div>
                      {items.map(t => {
                        const qty = cart.find(c => c.treatmentId === t.id)?.quantity || 0;
                        return (
                          <div key={t.id} onClick={() => add(t.id)} className={cn("h-9 flex items-center px-2 text-xs cursor-pointer hover:bg-muted/30", qty > 0 && "bg-primary/5")}>
                            <span className="flex-1 truncate">{t.name}</span>
                            <span className="w-10 text-right text-muted-foreground text-[10px]">{t.duration}′</span>
                            <span className="w-12 text-right font-medium">{t.price}€</span>
                            <div className="w-7 flex justify-end">{qty > 0 ? <span className="text-[10px] font-bold text-primary">×{qty}</span> : <Plus className="h-3 w-3 text-muted-foreground" />}</div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {!filtered.length && <div className="p-4 text-center text-xs text-muted-foreground">Aucune prestation</div>}
                </ScrollArea>
              </div>

              {/* RIGHT: Cart 40% */}
              <div className="w-[40%] flex flex-col min-h-0 bg-muted/20">
                <div className="h-8 px-2 flex items-center text-xs font-medium border-b shrink-0">Ticket ({itemCount})</div>
                <ScrollArea className="flex-1">
                  {cartDetails.length ? cartDetails.map(({ treatmentId, quantity, t }) => (
                    <div key={treatmentId} className="h-8 flex items-center gap-1 px-1.5 text-[11px] border-b border-dashed border-muted">
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => dec(treatmentId)}><Minus className="h-2.5 w-2.5" /></Button>
                      <span className="w-4 text-center font-medium">{quantity}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => inc(treatmentId)}><Plus className="h-2.5 w-2.5" /></Button>
                      <span className="flex-1 truncate ml-1">{t!.name}</span>
                      <span className="font-medium shrink-0">{((t!.price || 0) * quantity).toFixed(0)}€</span>
                    </div>
                  )) : <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">Vide</div>}
                </ScrollArea>
                {cart.length > 0 && (
                  <div className="px-2 py-1.5 border-t bg-background shrink-0">
                    <div className="flex justify-between text-[10px] text-muted-foreground"><span>Durée</span><span>{totalDuration} min</span></div>
                    <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span className="text-primary">{totalPrice}€</span></div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="h-10 px-2 flex items-center justify-between border-t shrink-0">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={back}><ArrowLeft className="mr-1 h-3 w-3" />Retour</Button>
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={mutation.isPending || !cart.length}>{mutation.isPending ? "..." : "Créer"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
