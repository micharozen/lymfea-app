import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, Euro, Timer, Globe, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getCurrentOffset } from "@/lib/timezones";

interface TreatmentRequest {
  id: string;
  hotel_id: string;
  treatment_id: string | null;
  client_first_name: string;
  client_last_name: string | null;
  client_phone: string;
  client_email: string | null;
  room_number: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  description: string | null;
}

interface CreateBookingFromRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: TreatmentRequest | null;
  quotedPrice: number | null;
  quotedDuration: number | null;
  onSuccess: (bookingId: string) => void;
}

export default function CreateBookingFromRequestDialog({
  open,
  onOpenChange,
  request,
  quotedPrice,
  quotedDuration,
  onSuccess,
}: CreateBookingFromRequestDialogProps) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("");
  const [hairdresserId, setHairdresserId] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [hourOpen, setHourOpen] = useState(false);
  const [minuteOpen, setMinuteOpen] = useState(false);

  // Pre-fill form when request changes
  useEffect(() => {
    if (request) {
      if (request.preferred_date) {
        setDate(new Date(request.preferred_date));
      }
      if (request.preferred_time) {
        setTime(request.preferred_time);
      }
      if (quotedPrice) {
        setPrice(quotedPrice.toString());
      }
      if (quotedDuration) {
        setDuration(quotedDuration.toString());
      }
    }
  }, [request, quotedPrice, quotedDuration]);

  const { data: hotel } = useQuery({
    queryKey: ["hotel", request?.hotel_id],
    queryFn: async () => {
      if (!request?.hotel_id) return null;
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, timezone")
        .eq("id", request.hotel_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!request?.hotel_id,
  });

  const hotelTimezone = hotel?.timezone || "Europe/Paris";

  const { data: hairdressers } = useQuery({
    queryKey: ["hairdressers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hairdressers")
        .select("id, first_name, last_name")
        .eq("status", "Actif")
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: treatment } = useQuery({
    queryKey: ["treatment", request?.treatment_id],
    queryFn: async () => {
      if (!request?.treatment_id) return null;
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("*")
        .eq("id", request.treatment_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!request?.treatment_id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!request || !date || !time) {
        throw new Error("Missing required fields");
      }

      const hairdresser = hairdressers?.find((h) => h.id === hairdresserId);
      const initialStatus = hairdresserId ? "confirmed" : "pending";
      const assignedAt = hairdresserId ? new Date().toISOString() : null;
      const formattedDate = format(date, "yyyy-MM-dd");

      // Auto-assign trunk from hotel
      let trunkId: string | null = null;
      const { data: trunks } = await supabase
        .from("trunks")
        .select("id")
        .eq("hotel_id", request.hotel_id)
        .eq("status", "active");
      
      if (trunks && trunks.length > 0) {
        // Get bookings at this time slot that have trunks assigned
        const { data: bookingsWithTrunks } = await supabase
          .from("bookings")
          .select("trunk_id")
          .eq("hotel_id", request.hotel_id)
          .eq("booking_date", formattedDate)
          .eq("booking_time", time)
          .not("trunk_id", "is", null)
          .not("status", "in", '("Annulé","Terminé","cancelled")');
        
        const usedTrunkIds = new Set(bookingsWithTrunks?.map(b => b.trunk_id) || []);
        
        // Find first available trunk
        for (const trunk of trunks) {
          if (!usedTrunkIds.has(trunk.id)) {
            trunkId = trunk.id;
            break;
          }
        }
      }

      // Create booking
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          hotel_id: request.hotel_id,
          hotel_name: hotel?.name || "",
          client_first_name: request.client_first_name,
          client_last_name: request.client_last_name || "",
          phone: request.client_phone,
          client_email: request.client_email,
          room_number: request.room_number,
          booking_date: formattedDate,
          booking_time: time,
          hairdresser_id: hairdresserId || null,
          hairdresser_name: hairdresser
            ? `${hairdresser.first_name} ${hairdresser.last_name}`
            : null,
          status: initialStatus,
          assigned_at: assignedAt,
          total_price: price ? parseFloat(price) : null,
          duration: duration ? parseInt(duration) : null,
          client_note: request.description,
          trunk_id: trunkId,
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      // If there's a treatment, add it to booking_treatments
      if (request.treatment_id) {
        const { error: treatmentError } = await supabase
          .from("booking_treatments")
          .insert({
            booking_id: bookingData.id,
            treatment_id: request.treatment_id,
          });
        if (treatmentError) {
          console.error("Error adding treatment:", treatmentError);
        }
      }

      // Send notifications
      try {
        await supabase.functions.invoke("trigger-new-booking-notifications", {
          body: { bookingId: bookingData.id },
        });
      } catch (notifError) {
        console.error("Error triggering notifications:", notifError);
      }

      // Send confirmation email to client
      if (request.client_email) {
        try {
          await supabase.functions.invoke("send-booking-confirmation", {
            body: { bookingId: bookingData.id },
          });
        } catch (emailError) {
          console.error("Error sending confirmation email:", emailError);
        }
      }

      return bookingData;
    },
    onSuccess: (data) => {
      toast({
        title: "Réservation créée",
        description: "La demande a été convertie en réservation.",
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      onSuccess(data.id);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Impossible de créer la réservation.",
        variant: "destructive",
      });
      console.error("Error creating booking:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) {
      toast({
        title: "Champs requis",
        description: "Veuillez sélectionner une date et une heure.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
  };

  const handleClose = () => {
    setDate(undefined);
    setTime("");
    setHairdresserId("");
    setPrice("");
    setDuration("");
    onOpenChange(false);
  };

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Convertir en réservation</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Client Info Summary */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="font-medium">
              {request.client_first_name} {request.client_last_name || ""}
            </p>
            <p className="text-sm text-muted-foreground">{request.client_phone}</p>
            {request.room_number && (
              <p className="text-sm text-muted-foreground">
                Chambre {request.room_number}
              </p>
            )}
          </div>

          {/* Treatment Summary */}
          {treatment && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">{treatment.name}</p>
              <p className="text-sm text-muted-foreground">{treatment.category}</p>
            </div>
          )}

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
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
                    {date
                      ? format(date, "dd/MM/yyyy", { locale: fr })
                      : "Sélectionner"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    locale={fr}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Heure *</Label>
              <div className="flex gap-1 items-center">
                <Popover open={hourOpen} onOpenChange={setHourOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 w-[68px] justify-between font-normal hover:bg-background hover:text-foreground">
                      {time.split(':')[0] || "HH"}
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start">
                    <ScrollArea className="h-40">
                      <div>
                        {Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, '0')).map(h => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => {
                              setTime(`${h}:${time.split(':')[1] || '00'}`);
                              setHourOpen(false);
                            }}
                            className={cn(
                              "w-full px-3 py-1.5 text-sm text-center hover:bg-muted",
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
                <span className="text-muted-foreground">:</span>
                <Popover open={minuteOpen} onOpenChange={setMinuteOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 w-[68px] justify-between font-normal hover:bg-background hover:text-foreground">
                      {time.split(':')[1] || "MM"}
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start">
                    <ScrollArea className="h-40">
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
                              "w-full px-3 py-1.5 text-sm text-center hover:bg-muted",
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
                <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                  <Globe className="h-3 w-3 shrink-0" />
                  {getCurrentOffset(hotelTimezone)}
                </span>
              </div>
            </div>
          </div>

          {/* Price and Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Euro className="h-4 w-4" />
                Prix total (€)
              </Label>
              <Input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ex: 150"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Timer className="h-4 w-4" />
                Durée (min)
              </Label>
              <Input
                type="number"
                min="0"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Ex: 90"
              />
            </div>
          </div>

          {/* Hairdresser */}
          <div className="space-y-2">
            <Label>Coiffeur (optionnel)</Label>
            <Select value={hairdresserId} onValueChange={setHairdresserId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un coiffeur" />
              </SelectTrigger>
              <SelectContent>
                {hairdressers?.map((hairdresser) => (
                  <SelectItem key={hairdresser.id} value={hairdresser.id}>
                    {hairdresser.first_name} {hairdresser.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Création..." : "Créer la réservation"}
            {createMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
