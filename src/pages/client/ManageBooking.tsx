import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInMinutes, addDays, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  MapPin,
  Phone,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
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
import TimePeriodSelector from "@/components/client/TimePeriodSelector";
import { useToast } from "@/hooks/use-toast";
import { brand, brandLogos } from "@/config/brand";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

interface HotelInfo {
  id: string;
  name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  contact_phone: string | null;
  opening_time: string | null;
  closing_time: string | null;
  slot_interval: number | null;
}

interface BookingTreatmentRow {
  id: string;
  treatment_id: string;
  treatment: { id: string; name: string | null; duration: number | null; price: number | null } | null;
}

interface BookingRow {
  id: string;
  booking_id: number | string;
  booking_date: string;
  booking_time: string;
  client_first_name: string | null;
  client_last_name: string | null;
  phone: string | null;
  client_email: string | null;
  hotel_id: string;
  hotel_name: string | null;
  room_number: string | null;
  total_price: number | null;
  status: string;
  language: "fr" | "en" | null;
  booking_treatments: BookingTreatmentRow[] | null;
  hotels: HotelInfo | null;
}

const ManageBooking = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showConfirmCancelDialog, setShowConfirmCancelDialog] = useState(false);
  const [showLateWarningDialog, setShowLateWarningDialog] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const { data: booking, isLoading, error } = useQuery<BookingRow | null>({
    queryKey: ["client-booking", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `*,
          booking_treatments(
            id,
            treatment_id,
            treatment:treatment_menus(id, name, duration, price)
          )`
        )
        .eq("id", bookingId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      let hotelInfo: HotelInfo | null = null;
      if ((data as { hotel_id?: string }).hotel_id) {
        const { data: hotelRows } = await supabase.rpc("get_public_hotel_by_id", {
          _hotel_id: (data as { hotel_id: string }).hotel_id,
        });
        const h = Array.isArray(hotelRows) ? hotelRows[0] : hotelRows;
        if (h) {
          hotelInfo = {
            id: h.id,
            name: h.name ?? null,
            address: h.address ?? null,
            postal_code: h.postal_code ?? null,
            city: h.city ?? null,
            contact_phone: h.contact_phone ?? null,
            opening_time: h.opening_time ?? null,
            closing_time: h.closing_time ?? null,
            slot_interval: h.slot_interval ?? null,
          };
        }
      }

      return { ...(data as unknown as BookingRow), hotels: hotelInfo };
    },
    enabled: !!bookingId,
  });

  const timeInfo = useMemo(() => {
    if (!booking) return null;
    const now = new Date();
    const bookingDateTime = parseISO(`${booking.booking_date}T${booking.booking_time}`);
    const minutesUntilAppointment = differenceInMinutes(bookingDateTime, now);
    const hoursUntilAppointment = minutesUntilAppointment / 60;
    return {
      bookingDateTime,
      canActFreely: hoursUntilAppointment > 2,
      isPast: minutesUntilAppointment < 0,
    };
  }, [booking]);

  const language: "fr" | "en" = (booking?.language ?? "fr") === "en" ? "en" : "fr";
  const hotel = booking?.hotels ?? null;

  const addressLine = useMemo(() => {
    if (!hotel) return "";
    return [hotel.address, hotel.postal_code, hotel.city].filter(Boolean).join(", ");
  }, [hotel]);

  const mapsHref = useMemo(() => {
    if (!hotel) return "";
    const q = [hotel.name, hotel.address, hotel.city].filter(Boolean).join(", ");
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }, [hotel]);

  const timeSlotOptions = useMemo(() => {
    if (!hotel) return [];
    const openingStr = hotel.opening_time ?? "10:00";
    const closingStr = hotel.closing_time ?? "20:00";
    const slotInterval = hotel.slot_interval ?? 30;

    const parseMin = (t: string) => {
      const [h, m] = t.split(":");
      return parseInt(h, 10) * 60 + parseInt(m ?? "0", 10);
    };
    const openingMinutes = parseMin(openingStr);
    const closingMinutes = parseMin(closingStr);

    const slots: { value: string; label: string; hour: number }[] = [];
    for (let minutes = openingMinutes; minutes < closingMinutes; minutes += slotInterval) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const hh = hour.toString().padStart(2, "0");
      const mm = minute.toString().padStart(2, "0");
      slots.push({
        value: `${hh}:${mm}:00`,
        label: `${hh}:${mm}`,
        hour,
      });
    }
    return slots;
  }, [hotel]);

  useEffect(() => {
    if (!rescheduleOpen || !selectedDate || !booking) return;
    let cancelled = false;
    setLoadingSlots(true);
    (async () => {
      const treatmentIds = (booking.booking_treatments ?? [])
        .map((bt) => bt.treatment_id)
        .filter(Boolean);

      const { data, error: invokeError } = await invokeEdgeFunction<
        Record<string, unknown>,
        { availableSlots?: string[] }
      >("check-availability", {
        skipAuth: true,
        body: {
          hotelId: booking.hotel_id,
          date: selectedDate,
          treatmentIds,
          excludeBookingId: booking.id,
        },
      });

      if (cancelled) return;
      if (invokeError) {
        console.error("[ManageBooking] check-availability error:", invokeError);
        setAvailableSlots([]);
      } else {
        setAvailableSlots(data?.availableSlots ?? []);
      }
      setLoadingSlots(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [rescheduleOpen, selectedDate, booking]);

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!booking || !selectedDate || !selectedTime) throw new Error("Missing date/time");
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          booking_date: selectedDate,
          booking_time: selectedTime,
        })
        .eq("id", booking.id);
      if (updateError) throw updateError;

      await invokeEdgeFunction("send-booking-notification", {
        skipAuth: true,
        body: {
          bookingId: booking.id,
          language,
          channels: ["sms"],
          type: "reschedule",
          clientPhone: booking.phone ?? undefined,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-booking", bookingId] });
      toast({
        title: "Réservation modifiée",
        description: "Un SMS de confirmation vient d'être envoyé.",
      });
      setRescheduleOpen(false);
      setSelectedTime("");
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible de modifier la réservation. Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!booking) throw new Error("No booking");
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancellation_reason: "Annulation client (Web)",
        })
        .eq("id", booking.id);
      if (updateError) throw updateError;

      await invokeEdgeFunction("send-booking-notification", {
        skipAuth: true,
        body: {
          bookingId: booking.id,
          language,
          channels: ["sms"],
          type: "cancellation",
          clientPhone: booking.phone ?? undefined,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-booking", bookingId] });
      toast({
        title: "Réservation annulée",
        description: "Un SMS d'annulation avec un lien de re-réservation vous a été envoyé.",
      });
      setShowConfirmCancelDialog(false);
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible d'annuler la réservation. Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  const openReschedule = () => {
    if (!timeInfo) return;
    if (!timeInfo.canActFreely) {
      setShowLateWarningDialog(true);
      return;
    }
    setSelectedDate(booking?.booking_date ?? "");
    setSelectedTime("");
    setRescheduleOpen(true);
  };

  const handleCancelClick = () => {
    if (!timeInfo) return;
    if (timeInfo.canActFreely) {
      setShowConfirmCancelDialog(true);
    } else {
      setShowLateWarningDialog(true);
    }
  };

  if (isLoading) {
    return (
      <div className="lymfea-client min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="lymfea-client min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <img src={brandLogos.primary} alt={brand.name} className="h-12 mb-6" />
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Réservation introuvable</h2>
            <p className="text-muted-foreground">
              Cette réservation n'existe pas ou le lien est invalide.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCancelled = booking.status === "cancelled";
  const isCompleted = booking.status === "completed";
  const hotelName = hotel?.name ?? booking.hotel_name ?? "";
  const totalPrice = Number(booking.total_price ?? 0);
  const clientFullName = `${booking.client_first_name ?? ""} ${booking.client_last_name ?? ""}`.trim();

  return (
    <div className="lymfea-client min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-md mx-auto h-16 sm:h-18 md:h-20 flex items-center justify-center px-4">
          <img
            src={brandLogos.primary}
            alt={brand.name}
            className="h-7"
          />
        </div>
      </header>

      <div className="bg-white px-4 pt-6 pb-4 text-center space-y-2">
        <h1 className="font-serif text-2xl sm:text-3xl text-gold-600 tracking-wide leading-tight">
          {hotelName}
        </h1>
        {hotel?.address && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 justify-center"
          >
            <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-500 underline decoration-gray-300">
              {addressLine}
            </span>
          </a>
        )}
        {hotel?.contact_phone && (
          <div className="flex items-center gap-1.5 justify-center">
            <Phone className="w-3 h-3 text-gray-400 shrink-0" />
            <a
              href={`tel:${hotel.contact_phone.replace(/\s/g, "")}`}
              className="text-xs text-gray-500 underline decoration-gray-300"
            >
              {hotel.contact_phone}
            </a>
          </div>
        )}
      </div>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {isCancelled && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Annulée</span>
          </div>
        )}

        {isCompleted && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-600">Terminée</span>
          </div>
        )}

        <Card className="bg-white border-gray-100 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gold-600">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-base font-medium text-gray-900">
                  {format(parseISO(booking.booking_date), "EEEE d MMMM", { locale: fr })}
                </p>
                <p className="text-sm text-gray-500">
                  {booking.booking_time.slice(0, 5)}
                  {booking.room_number ? ` · Ch. ${booking.room_number}` : ""}
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              {(booking.booking_treatments ?? []).map((bt) => (
                <div key={bt.id} className="flex justify-between text-sm">
                  <span className="text-gray-700 font-light">{bt.treatment?.name ?? "—"}</span>
                  {bt.treatment?.price != null && (
                    <span className="text-gray-900 font-medium">{bt.treatment.price}€</span>
                  )}
                </div>
              ))}
            </div>

            {totalPrice > 0 && (
              <div className="border-t border-gray-100 pt-4 flex justify-between items-center">
                <span className="text-gray-900 font-medium">Total</span>
                <span className="text-lg font-semibold text-gray-900">{totalPrice}€</span>
              </div>
            )}
          </CardContent>
        </Card>

        {clientFullName && (
          <div className="text-xs text-gray-500 text-center">
            {clientFullName}
            {booking.phone && (
              <>
                <span className="mx-2">·</span>
                <span>{booking.phone}</span>
              </>
            )}
          </div>
        )}

        {!isCancelled && !isCompleted && timeInfo && !timeInfo.isPast && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              variant="destructive"
              size="sm"
              className="h-9"
              onClick={handleCancelClick}
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              Annuler
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-gold-400 text-gray-900 hover:bg-gold-50"
              onClick={openReschedule}
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Modifier
            </Button>
          </div>
        )}

        {timeInfo?.isPast && !isCancelled && !isCompleted && (
          <p className="text-xs text-center text-gray-500">
            Rendez-vous passé, aucune action possible.
          </p>
        )}
      </main>

      <Drawer open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader>
            <DrawerTitle className="text-center">Choisir un nouveau créneau</DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-2 overflow-y-auto">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                locale={fr}
                selected={selectedDate ? parseISO(selectedDate) : undefined}
                onSelect={(date) => {
                  if (!date) return;
                  setSelectedTime("");
                  setSelectedDate(format(date, "yyyy-MM-dd"));
                }}
                disabled={(date) => {
                  const today = startOfDay(new Date());
                  const max = addDays(today, 90);
                  return date < today || date > max;
                }}
              />
            </div>

            <div className="mt-4">
              {!selectedDate ? (
                <p className="text-center text-sm text-gray-500 py-6">
                  Sélectionnez une date pour voir les créneaux disponibles.
                </p>
              ) : loadingSlots ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gold-500" />
                </div>
              ) : availableSlots.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-6">
                  Aucune disponibilité à cette date. Choisissez-en une autre.
                </p>
              ) : (
                <TimePeriodSelector
                  availableSlots={availableSlots}
                  selectedTime={selectedTime}
                  onSelectTime={setSelectedTime}
                  allTimeSlots={timeSlotOptions}
                />
              )}
            </div>
          </div>

          <DrawerFooter>
            <Button
              className="h-12"
              disabled={!selectedDate || !selectedTime || rescheduleMutation.isPending}
              onClick={() => rescheduleMutation.mutate()}
            >
              {rescheduleMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Confirmer le nouveau créneau"
              )}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={showConfirmCancelDialog} onOpenChange={setShowConfirmCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la réservation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir annuler cette réservation ? Vous recevrez un SMS de confirmation avec un lien pour réserver à nouveau.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Non, conserver</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Annulation..." : "Oui, annuler"}
              {cancelMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLateWarningDialog} onOpenChange={setShowLateWarningDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Action impossible en ligne
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Il est trop tard pour modifier ou annuler en ligne (moins de 2 heures avant le soin).
              </p>
              <p>Veuillez contacter directement la conciergerie de l'hôtel.</p>
              {hotel?.contact_phone && (
                <div className="bg-muted rounded-lg p-3 flex items-center gap-3">
                  <Phone className="h-5 w-5 text-primary" />
                  <a
                    href={`tel:${hotel.contact_phone.replace(/\s/g, "")}`}
                    className="font-medium"
                  >
                    {hotel.contact_phone}
                  </a>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fermer</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageBooking;
