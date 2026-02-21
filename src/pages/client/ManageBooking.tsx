import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, Clock, MapPin, Scissors, AlertTriangle, CheckCircle, Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { brand, brandLogos } from "@/config/brand";

const ManageBooking = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showLateWarningDialog, setShowLateWarningDialog] = useState(false);

  // Fetch booking details
  const { data: booking, isLoading, error } = useQuery({
    queryKey: ["client-booking", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          booking_treatments(
            id,
            treatment_id,
            treatment:treatment_menus(id, name, duration, price)
          )
        `)
        .eq("id", bookingId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });

  // Calculate time remaining until appointment
  const timeInfo = useMemo(() => {
    if (!booking) return null;

    const now = new Date();
    const bookingDateTime = parseISO(`${booking.booking_date}T${booking.booking_time}`);
    const minutesUntilAppointment = differenceInMinutes(bookingDateTime, now);
    const hoursUntilAppointment = minutesUntilAppointment / 60;

    return {
      bookingDateTime,
      minutesUntilAppointment,
      hoursUntilAppointment,
      canCancelFreely: hoursUntilAppointment > 2,
      isPast: minutesUntilAppointment < 0,
    };
  }, [booking]);

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancellation_reason: "Annulation client (Web)",
        })
        .eq("id", bookingId);

      if (error) throw error;
    },
    onSuccess: () => {
      // Note: The database trigger automatically calls handle-booking-cancellation
      // which sends notifications to therapist, concierge, and client
      queryClient.invalidateQueries({ queryKey: ["client-booking", bookingId] });
      toast({
        title: "Réservation annulée",
        description: "Aucun frais ne sera appliqué.",
      });
      setShowConfirmDialog(false);
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible d'annuler la réservation. Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  const handleCancelClick = () => {
    if (!timeInfo) return;

    if (timeInfo.canCancelFreely) {
      setShowConfirmDialog(true);
    } else {
      setShowLateWarningDialog(true);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <img src={brandLogos.primary} alt={brand.name} className="h-12 mb-6" />
        <Card className="w-full max-w-[92vw] sm:max-w-sm md:max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-10 w-10 sm:h-12 sm:w-12 text-destructive mx-auto mb-4" />
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

  return (
    <div className="min-h-screen bg-background">
      {/* Compact Header */}
      <div className="bg-primary text-primary-foreground p-3 sm:p-4">
        <div className="max-w-[92vw] sm:max-w-sm md:max-w-md mx-auto flex items-center justify-between">
          <img src={brandLogos.primary} alt={brand.name} className="h-5 sm:h-6 brightness-0 invert" />
          <span className="text-sm opacity-80">#{booking.booking_id}</span>
        </div>
      </div>

      <div className="max-w-[92vw] sm:max-w-sm md:max-w-md mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {/* Status Badge */}
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

        {/* Main Info Card */}
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
            {/* Date & Time + Hotel */}
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">
                    {format(parseISO(booking.booking_date), "EEE d MMM", { locale: fr })}
                  </p>
                  <p className="text-xs text-muted-foreground">{booking.booking_time.slice(0, 5)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium text-sm">{booking.hotel_name || "Hôtel"}</p>
                {booking.room_number && (
                  <p className="text-xs text-muted-foreground">Ch. {booking.room_number}</p>
                )}
              </div>
            </div>

            {/* Treatments - Compact */}
            <div className="border-t pt-3">
              {booking.booking_treatments?.map((bt: any) => (
                <div key={bt.id} className="flex justify-between text-sm py-1">
                  <span>{bt.treatment?.name}</span>
                  {bt.treatment?.price && <span className="font-medium">{bt.treatment.price}€</span>}
                </div>
              ))}
            </div>

            {/* Total */}
            {booking.total_price && (
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="font-medium">Total</span>
                <span className="text-lg font-bold">{booking.total_price}€</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Info - Inline */}
        <div className="text-sm text-muted-foreground">
          <span>{booking.client_first_name} {booking.client_last_name}</span>
          <span className="mx-2">•</span>
          <span>{booking.phone}</span>
        </div>

        {/* Cancel Button */}
        {!isCancelled && !isCompleted && timeInfo && !timeInfo.isPast && (
          <Button
            variant={timeInfo.canCancelFreely ? "destructive" : "outline"}
            size="sm"
            className="w-full"
            onClick={handleCancelClick}
          >
            {timeInfo.canCancelFreely ? "Annuler" : "Annulation tardive"}
          </Button>
        )}

        {timeInfo?.isPast && !isCancelled && !isCompleted && (
          <p className="text-xs text-center text-muted-foreground">
            Rendez-vous passé, annulation impossible.
          </p>
        )}
      </div>

      {/* Confirm Cancellation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la réservation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir annuler cette réservation ? Cette action est irréversible.
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

      {/* Late Cancellation Warning Dialog */}
      <AlertDialog open={showLateWarningDialog} onOpenChange={setShowLateWarningDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Annulation tardive
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Il est trop tard pour annuler gratuitement en ligne (moins de 2 heures avant le soin).
              </p>
              <p className="font-medium text-foreground">
                Toute annulation sera facturée.
              </p>
              <p>
                Veuillez contacter la conciergerie de l'hôtel pour procéder à l'annulation.
              </p>
              <div className="bg-muted rounded-lg p-4 flex items-center gap-3">
                <Phone className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Contactez la conciergerie</p>
                  <p className="text-sm text-muted-foreground">
                    Appelez l'hôtel {booking.hotel_name || ""} pour procéder
                  </p>
                </div>
              </div>
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
