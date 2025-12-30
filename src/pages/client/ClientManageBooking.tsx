import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, Clock, MapPin, Scissors, AlertTriangle, CheckCircle, Phone } from "lucide-react";
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
import oomLogo from "@/assets/oom-logo.svg";

const ClientManageBooking = () => {
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
        <img src={oomLogo} alt="OOM" className="h-12 mb-6" />
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-6">
        <div className="max-w-md mx-auto">
          <img src={oomLogo} alt="OOM" className="h-8 mb-4 brightness-0 invert" />
          <h1 className="text-2xl font-bold">Gérer ma réservation</h1>
          <p className="text-primary-foreground/80">Réservation #{booking.booking_id}</p>
        </div>
      </div>

      <div className="max-w-md mx-auto p-6 space-y-6">
        {/* Status Badge */}
        {isCancelled && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Réservation annulée</p>
              {booking.cancellation_reason && (
                <p className="text-sm text-muted-foreground">{booking.cancellation_reason}</p>
              )}
            </div>
          </div>
        )}

        {isCompleted && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="font-medium text-green-600">Réservation terminée</p>
          </div>
        )}

        {/* Booking Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Détails de la réservation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Date & Time */}
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">
                  {format(parseISO(booking.booking_date), "EEEE d MMMM yyyy", { locale: fr })}
                </p>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{booking.booking_time.slice(0, 5)}</span>
                </div>
              </div>
            </div>

            {/* Hotel */}
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{booking.hotel_name || "Hôtel"}</p>
                {booking.room_number && (
                  <p className="text-muted-foreground">Chambre {booking.room_number}</p>
                )}
              </div>
            </div>

            {/* Treatments */}
            <div className="flex items-start gap-3">
              <Scissors className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="font-medium mb-2">Prestations</p>
                <ul className="space-y-1">
                  {booking.booking_treatments?.map((bt: any) => (
                    <li key={bt.id} className="text-muted-foreground flex justify-between">
                      <span>{bt.treatment?.name}</span>
                      {bt.treatment?.price && (
                        <span className="font-medium text-foreground">
                          {bt.treatment.price}€
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Total */}
            {booking.total_price && (
              <div className="border-t pt-4 flex justify-between items-center">
                <span className="font-medium">Total</span>
                <span className="text-xl font-bold">{booking.total_price}€</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Vos informations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              <span className="text-muted-foreground">Nom :</span>{" "}
              {booking.client_first_name} {booking.client_last_name}
            </p>
            {booking.client_email && (
              <p>
                <span className="text-muted-foreground">Email :</span> {booking.client_email}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Téléphone :</span> {booking.phone}
            </p>
          </CardContent>
        </Card>

        {/* Cancel Button */}
        {!isCancelled && !isCompleted && timeInfo && !timeInfo.isPast && (
          <Button
            variant={timeInfo.canCancelFreely ? "destructive" : "outline"}
            className="w-full"
            onClick={handleCancelClick}
          >
            {timeInfo.canCancelFreely ? "Annuler la réservation" : "Annulation tardive"}
          </Button>
        )}

        {timeInfo?.isPast && !isCancelled && !isCompleted && (
          <div className="bg-muted rounded-lg p-4 text-center">
            <p className="text-muted-foreground">
              Le rendez-vous est passé, l'annulation n'est plus possible.
            </p>
          </div>
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

export default ClientManageBooking;
