import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { formatPrice } from "@/lib/formatPrice";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import {
  User,
  Phone,
  Mail,
  DoorOpen,
  Calendar,
  Clock,
  Building2,
  Scissors,
  CreditCard,
  Euro,
  FileText,
  Pencil,
  Timer,
  Send,
  X,
  Loader2,
} from "lucide-react";
import type { BookingWithTreatments, Hotel } from "@/hooks/booking";

interface BookingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingWithTreatments | null;
  hotel: Hotel | null;
  onEdit?: () => void;
  onSendPaymentLink?: () => void;
}

export function BookingDetailDialog({
  open,
  onOpenChange,
  booking,
  hotel,
  onEdit,
  onSendPaymentLink,
}: BookingDetailDialogProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const queryClient = useQueryClient();

  // Get user role for permission check
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

  const canCancel =
    booking?.payment_status !== 'paid' &&
    booking?.payment_status !== 'charged_to_room' &&
    booking?.status !== 'cancelled' &&
    booking?.status !== 'completed' &&
    (userRole === 'admin' || userRole === 'concierge');

  // Cancellation mutation
  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!booking?.id) throw new Error("Booking ID manquant");

      const { data, error } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancellation_reason: reason,
        })
        .eq("id", booking.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Échec de la mise à jour - booking non modifié");

      return data;
    },
    onSuccess: async () => {
      // Call the backend cancellation handler
      if (booking?.id) {
        try {
          await invokeEdgeFunction(
            "handle-booking-cancellation",
            {
              body: {
                bookingId: booking.id,
                cancellationReason: cancellationReason || undefined,
              },
            }
          );
        } catch (e) {
          console.error("handle-booking-cancellation exception:", e);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({
        title: "Succès",
        description: "La réservation a été annulée avec succès",
      });
      setShowCancelDialog(false);
      setCancellationReason("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de l'annulation",
        variant: "destructive",
      });
      console.error("Error cancelling booking:", error);
    },
  });

  if (!booking) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold">
                Réservation #{booking.booking_id}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-2">
                <StatusBadge status={booking.status} type="booking" />
                {booking.status !== "quote_pending" && booking.status !== "waiting_approval" && (
                  <StatusBadge
                    status={booking.payment_status || "pending"}
                    type="payment"
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 pr-10">
              {onSendPaymentLink &&
               booking.payment_status !== 'paid' &&
               booking.payment_status !== 'charged_to_room' &&
               booking.status !== 'cancelled' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onSendPaymentLink();
                  }}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Envoyer lien paiement
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowCancelDialog(true)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Annuler
                </Button>
              )}
              {onEdit && (
                <Button
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onEdit();
                  }}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Modifier
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2 overflow-y-auto flex-1">
          {/* Client Info */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <User className="h-4 w-4" />
              Client
            </h3>
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {booking.client_first_name} {booking.client_last_name}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  <a href={`tel:${booking.phone}`} className="hover:text-primary">
                    {booking.phone}
                  </a>
                </div>
                {booking.client_email && (
                  <div className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    <a href={`mailto:${booking.client_email}`} className="hover:text-primary truncate">
                      {booking.client_email}
                    </a>
                  </div>
                )}
                {booking.room_number && (
                  <div className="flex items-center gap-1">
                    <DoorOpen className="h-3.5 w-3.5" />
                    <span>Chambre {booking.room_number}</span>
                  </div>
                )}
              </div>
              {booking.client_note && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-sm text-muted-foreground italic">"{booking.client_note}"</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Booking Details */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Réservation
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Date
                </div>
                <p className="font-medium">
                  {format(new Date(booking.booking_date), "EEEE d MMMM yyyy", { locale: fr })}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  Heure
                </div>
                <p className="font-medium">{booking.booking_time.substring(0, 5)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Building2 className="h-3.5 w-3.5" />
                  Hôtel
                </div>
                <p className="font-medium">{hotel?.name || booking.hotel_name || "-"}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Scissors className="h-3.5 w-3.5" />
                  Coiffeur
                </div>
                <p className="font-medium">{booking.hairdresser_name || "Non assigné"}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Treatments */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Scissors className="h-4 w-4" />
              Soins ({booking.treatments.length})
            </h3>
            {booking.treatments.length > 0 ? (
              <div className="space-y-2">
                {booking.treatments.map((treatment, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
                  >
                    <span className="text-sm font-medium">{treatment.name}</span>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {treatment.duration && (
                        <span className="flex items-center gap-1">
                          <Timer className="h-3.5 w-3.5" />
                          {treatment.duration} min
                        </span>
                      )}
                      {treatment.price && (
                        <span className="font-medium text-foreground">
                          {formatPrice(treatment.price, hotel?.currency || 'EUR')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t border-border/50">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3.5 w-3.5" />
                    Durée totale
                  </span>
                  <span className="font-medium">{booking.totalDuration} min</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun soin sélectionné</p>
            )}
          </div>

          <Separator />

          {/* Payment */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Paiement
            </h3>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Méthode</p>
                  <p className="font-medium capitalize">
                    {booking.payment_method === "room"
                      ? "Note de chambre"
                      : booking.payment_method === "card"
                        ? "Carte bancaire"
                        : booking.payment_method || "Non défini"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-xl font-semibold">{formatPrice(booking.total_price, hotel?.currency || 'EUR')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Payment link status */}
          {booking.payment_link_sent_at && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Lien de paiement
                </h3>
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    Envoyé le {format(new Date(booking.payment_link_sent_at), "dd/MM/yyyy à HH:mm", { locale: fr })}
                  </p>
                  {booking.payment_link_channels && booking.payment_link_channels.length > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                      Via {booking.payment_link_channels.map(c => c === 'email' ? 'Email' : 'WhatsApp').join(' et ')}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Cancellation reason */}
          {booking.status === "cancelled" && booking.cancellation_reason && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-destructive uppercase tracking-wide">
                  Raison d'annulation
                </h3>
                <p className="text-sm text-muted-foreground bg-destructive/10 rounded-lg p-3">
                  {booking.cancellation_reason}
                </p>
              </div>
            </>
          )}

          {/* Timestamps */}
          <div className="text-xs text-muted-foreground pt-2">
            <p>Créé le {format(new Date(booking.created_at), "dd/MM/yyyy à HH:mm", { locale: fr })}</p>
            {booking.updated_at !== booking.created_at && (
              <p>Modifié le {format(new Date(booking.updated_at), "dd/MM/yyyy à HH:mm", { locale: fr })}</p>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Cancel confirmation dialog */}
    <AlertDialog open={showCancelDialog} onOpenChange={(open) => {
      setShowCancelDialog(open);
      if (!open) setCancellationReason("");
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler la réservation</AlertDialogTitle>
          <AlertDialogDescription>
            Veuillez indiquer la raison de l'annulation. Cette action ne supprimera pas la réservation mais changera son statut en "Annulé".
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Label htmlFor="cancellation-reason" className="text-sm font-medium">
            Raison de l'annulation <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="cancellation-reason"
            value={cancellationReason}
            onChange={(e) => setCancellationReason(e.target.value)}
            placeholder="Saisissez la raison de l'annulation..."
            className="mt-2"
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Retour</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => cancelMutation.mutate(cancellationReason)}
            disabled={!cancellationReason.trim() || cancelMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelMutation.isPending ? "Annulation..." : "Confirmer l'annulation"}
            {cancelMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
