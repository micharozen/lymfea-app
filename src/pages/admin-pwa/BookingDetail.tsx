import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useBookingData } from "@/hooks/booking";
import type { BookingWithTreatments } from "@/hooks/booking";
import EditBookingDialog from "@/components/EditBookingDialog";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { formatPrice } from "@/lib/formatPrice";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import PwaHeader from "@/components/pwa/Header";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Timer,
  Send,
  X,
  Pencil,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export default function AdminPwaBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { bookings, getHotelInfo } = useBookingData();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPaymentLinkOpen, setIsPaymentLinkOpen] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  const booking = bookings?.find((b) => b.id === id) || null;
  const hotel = booking ? getHotelInfo(booking.hotel_id) : null;

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
    booking?.payment_status !== "paid" &&
    booking?.payment_status !== "charged_to_room" &&
    booking?.status !== "cancelled" &&
    booking?.status !== "completed" &&
    (userRole === "admin" || userRole === "concierge");

  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!booking?.id) throw new Error("Booking ID manquant");
      const { data, error } = await supabase
        .from("bookings")
        .update({ status: "cancelled", cancellation_reason: reason })
        .eq("id", booking.id)
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error("Booking non modifié");
      return data;
    },
    onSuccess: async () => {
      if (booking?.id) {
        try {
          await invokeEdgeFunction("handle-booking-cancellation", {
            body: { bookingId: booking.id, cancellationReason: cancellationReason || undefined },
          });
        } catch (e) {
          console.error("handle-booking-cancellation exception:", e);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({ title: "Succès", description: "La réservation a été annulée" });
      setShowCancelDialog(false);
      setCancellationReason("");
    },
    onError: () => {
      toast({ title: "Erreur", description: "Erreur lors de l'annulation", variant: "destructive" });
    },
  });

  if (!booking) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <PwaHeader title="Réservation" showBack backPath="/admin-pwa/dashboard" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <PwaHeader
        title={`#${booking.booking_id}`}
        showBack
        backPath="/admin-pwa/dashboard"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Status badges */}
          <div className="flex items-center gap-2">
            <StatusBadge status={booking.status} type="booking" />
            {booking.status !== "quote_pending" && booking.status !== "waiting_approval" && (
              <StatusBadge status={booking.payment_status || "pending"} type="payment" />
            )}
          </div>

          {/* Client Info */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <User className="h-4 w-4" /> Client
            </h3>
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <span className="font-medium">{booking.client_first_name} {booking.client_last_name}</span>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <a href={`tel:${booking.phone}`} className="flex items-center gap-1 hover:text-primary">
                  <Phone className="h-3.5 w-3.5" /> {booking.phone}
                </a>
                {booking.client_email && (
                  <a href={`mailto:${booking.client_email}`} className="flex items-center gap-1 hover:text-primary truncate">
                    <Mail className="h-3.5 w-3.5" /> {booking.client_email}
                  </a>
                )}
                {booking.room_number && (
                  <span className="flex items-center gap-1">
                    <DoorOpen className="h-3.5 w-3.5" /> Chambre {booking.room_number}
                  </span>
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
              <Calendar className="h-4 w-4" /> Réservation
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Calendar className="h-3.5 w-3.5" /> Date
                </div>
                <p className="font-medium text-sm">
                  {format(new Date(booking.booking_date), "EEE d MMM yyyy", { locale: fr })}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Clock className="h-3.5 w-3.5" /> Heure
                </div>
                <p className="font-medium text-sm">{booking.booking_time?.substring(0, 5)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Building2 className="h-3.5 w-3.5" /> Hôtel
                </div>
                <p className="font-medium text-sm">{hotel?.name || booking.hotel_name || "-"}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Scissors className="h-3.5 w-3.5" /> Coiffeur
                </div>
                <p className="font-medium text-sm">{booking.hairdresser_name || "Non assigné"}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Treatments */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Scissors className="h-4 w-4" /> Soins ({booking.treatments.length})
            </h3>
            {booking.treatments.length > 0 ? (
              <div className="space-y-2">
                {booking.treatments.map((treatment, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium">{treatment.name}</span>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {treatment.duration && (
                        <span className="flex items-center gap-1">
                          <Timer className="h-3.5 w-3.5" /> {treatment.duration} min
                        </span>
                      )}
                      {treatment.price && (
                        <span className="font-medium text-foreground">
                          {formatPrice(treatment.price, hotel?.currency || "EUR")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t border-border/50">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3.5 w-3.5" /> Durée totale
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
              <CreditCard className="h-4 w-4" /> Paiement
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
                  <p className="text-xl font-semibold">
                    {formatPrice(booking.total_price, hotel?.currency || "EUR")}
                  </p>
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
                  <Send className="h-4 w-4" /> Lien de paiement
                </h3>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-green-700">
                    Envoyé le {format(new Date(booking.payment_link_sent_at), "dd/MM/yyyy à HH:mm", { locale: fr })}
                  </p>
                  {booking.payment_link_channels && booking.payment_link_channels.length > 0 && (
                    <p className="text-sm text-green-600 mt-1">
                      Via {booking.payment_link_channels.map((c: string) => c === "email" ? "Email" : "WhatsApp").join(" et ")}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Payment Error */}
          {booking.payment_status === "failed" && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-destructive uppercase tracking-wide flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Échec de paiement
                </h3>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-700">
                    {(booking as any).payment_error_message || "Le paiement a échoué"}
                  </p>
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

          {/* Actions */}
          <div className="flex gap-2 pt-2 pb-8">
            <Button
              className="flex-1"
              onClick={() => setIsEditOpen(true)}
            >
              <Pencil className="h-4 w-4 mr-2" /> Modifier
            </Button>
            {booking.payment_status !== "paid" &&
             booking.payment_status !== "charged_to_room" &&
             booking.status !== "cancelled" && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsPaymentLinkOpen(true)}
              >
                <Send className="h-4 w-4 mr-2" /> Lien paiement
              </Button>
            )}
            {canCancel && (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setShowCancelDialog(true)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <EditBookingDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        booking={booking as any}
      />

      {/* Payment Link Dialog */}
      <SendPaymentLinkDialog
        open={isPaymentLinkOpen}
        onOpenChange={setIsPaymentLinkOpen}
        booking={booking as any}
      />

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={(open) => {
        setShowCancelDialog(open);
        if (!open) setCancellationReason("");
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la réservation</AlertDialogTitle>
            <AlertDialogDescription>
              Indiquez la raison de l'annulation. Le statut passera en "Annulé".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="cancel-reason" className="text-sm font-medium">
              Raison <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cancel-reason"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="Raison de l'annulation..."
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
              {cancelMutation.isPending ? "Annulation..." : "Confirmer"}
              {cancelMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
