import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarDays, Clock, AlertCircle } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { supabase } from "@/integrations/supabase/client";
import { format, isBefore, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";

interface ProposeAlternativeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    id: string;
    booking_date: string;
    booking_time: string;
    client_first_name: string;
    client_last_name?: string;
    phone?: string;
  };
  onProposalSent: () => void;
}

// Generate time slots from 6:00 to 22:00 in 30-minute increments
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = 6; hour <= 22; hour++) {
    slots.push(`${hour.toString().padStart(2, "0")}:00`);
    if (hour < 22) {
      slots.push(`${hour.toString().padStart(2, "0")}:30`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

export const ProposeAlternativeDialog = ({
  open,
  onOpenChange,
  booking,
  onProposalSent,
}: ProposeAlternativeDialogProps) => {
  const [sending, setSending] = useState(false);
  const [hairdresserId, setHairdresserId] = useState<string | null>(null);

  // Fetch hairdresser ID when dialog opens
  useEffect(() => {
    const fetchHairdresserId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: hairdresserData } = await supabase
        .from("hairdressers")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (hairdresserData) {
        setHairdresserId(hairdresserData.id);
      }
    };

    if (open) {
      fetchHairdresserId();
    }
  }, [open]);

  // Alternative 1 (preferred)
  const [alt1Date, setAlt1Date] = useState<Date | undefined>(undefined);
  const [alt1Time, setAlt1Time] = useState<string>("");

  // Alternative 2 (fallback)
  const [alt2Date, setAlt2Date] = useState<Date | undefined>(undefined);
  const [alt2Time, setAlt2Time] = useState<string>("");

  // Which calendar is currently open
  const [showCalendar, setShowCalendar] = useState<1 | 2 | null>(null);

  const today = startOfDay(new Date());
  const originalDate = new Date(booking.booking_date);
  const originalTime = booking.booking_time?.slice(0, 5) || "10:00";

  const formatDisplayDate = (date: Date | undefined) => {
    if (!date) return "Sélectionner une date";
    return format(date, "EEEE d MMMM", { locale: fr });
  };

  const formatDisplayTime = (time: string) => {
    if (!time) return "Heure";
    const [hours, minutes] = time.split(":");
    return `${hours}h${minutes}`;
  };

  const handleSubmit = async () => {
    // Validation
    if (!alt1Date || !alt1Time) {
      toast.error("Veuillez sélectionner la première proposition");
      return;
    }
    if (!alt2Date || !alt2Time) {
      toast.error("Veuillez sélectionner la deuxième proposition");
      return;
    }

    // Check that alternatives are different
    const alt1Str = `${format(alt1Date, "yyyy-MM-dd")}-${alt1Time}`;
    const alt2Str = `${format(alt2Date, "yyyy-MM-dd")}-${alt2Time}`;
    if (alt1Str === alt2Str) {
      toast.error("Les deux propositions doivent être différentes");
      return;
    }

    if (!booking.phone) {
      toast.error("Numéro de téléphone du client manquant");
      return;
    }

    if (!hairdresserId) {
      toast.error("Profil coiffeur non trouvé");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await invokeEdgeFunction<
        {
          bookingId: string;
          hairdresserId: string;
          alternative1: { date: string; time: string };
          alternative2: { date: string; time: string };
        },
        { success: boolean; proposalId?: string; warning?: string; error?: string }
      >("propose-alternative", {
        body: {
          bookingId: booking.id,
          hairdresserId,
          alternative1: {
            date: format(alt1Date, "yyyy-MM-dd"),
            time: alt1Time,
          },
          alternative2: {
            date: format(alt2Date, "yyyy-MM-dd"),
            time: alt2Time,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data?.warning) {
        toast.warning(data.warning);
      } else {
        toast.success("Proposition envoyée au client par WhatsApp");
      }

      onOpenChange(false);
      onProposalSent();
    } catch (error) {
      console.error("Error proposing alternative:", error);
      toast.error("Erreur lors de l'envoi de la proposition");
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setAlt1Date(undefined);
    setAlt1Time("");
    setAlt2Date(undefined);
    setAlt2Time("");
    setShowCalendar(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-lg">Proposer un autre créneau</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto">
          {/* Original booking info */}
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Créneau original</p>
            <p className="font-medium text-sm">
              {format(originalDate, "EEEE d MMMM", { locale: fr })} à {formatDisplayTime(originalTime)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Client : {booking.client_first_name} {booking.client_last_name || ""}
            </p>
          </div>

          {/* Warning if no phone */}
          {!booking.phone && (
            <div className="bg-destructive/10 text-destructive rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-xs">
                Ce client n'a pas de numéro de téléphone. La proposition ne pourra pas être envoyée par WhatsApp.
              </p>
            </div>
          )}

          {/* Alternative 1 */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                1
              </span>
              Première proposition (préférée)
            </label>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 justify-start text-left font-normal"
                onClick={() => setShowCalendar(showCalendar === 1 ? null : 1)}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {formatDisplayDate(alt1Date)}
              </Button>

              <Select value={alt1Time} onValueChange={setAlt1Time}>
                <SelectTrigger className="w-24">
                  <Clock className="mr-1 h-4 w-4" />
                  <SelectValue placeholder="Heure" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {formatDisplayTime(slot)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showCalendar === 1 && (
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={alt1Date}
                  onSelect={(date) => {
                    setAlt1Date(date);
                    setShowCalendar(null);
                  }}
                  disabled={(date) => isBefore(date, today)}
                  locale={fr}
                  className="rounded-md border"
                />
              </div>
            )}
          </div>

          {/* Alternative 2 */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center">
                2
              </span>
              Deuxième proposition (si refus)
            </label>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 justify-start text-left font-normal"
                onClick={() => setShowCalendar(showCalendar === 2 ? null : 2)}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {formatDisplayDate(alt2Date)}
              </Button>

              <Select value={alt2Time} onValueChange={setAlt2Time}>
                <SelectTrigger className="w-24">
                  <Clock className="mr-1 h-4 w-4" />
                  <SelectValue placeholder="Heure" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {formatDisplayTime(slot)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showCalendar === 2 && (
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={alt2Date}
                  onSelect={(date) => {
                    setAlt2Date(date);
                    setShowCalendar(null);
                  }}
                  disabled={(date) => isBefore(date, today)}
                  locale={fr}
                  className="rounded-md border"
                />
              </div>
            )}
          </div>

          {/* Info */}
          <p className="text-xs text-muted-foreground">
            Le client recevra un message WhatsApp avec la première proposition. S'il refuse, la deuxième lui sera proposée automatiquement.
          </p>
        </div>

        <DrawerFooter className="pt-2">
          <Button
            onClick={handleSubmit}
            disabled={sending || !alt1Date || !alt1Time || !alt2Date || !alt2Time || !booking.phone || !hairdresserId}
            className="w-full"
          >
            {sending ? "Envoi en cours..." : "Envoyer la proposition"}
          </Button>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={sending}>
            Annuler
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
