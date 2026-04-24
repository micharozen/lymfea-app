import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ButtonGroup } from "@/components/ui/button-group";
import { formatPrice } from "@/lib/formatPrice";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import {
  User, Phone, Mail, DoorOpen, Calendar, Clock, Building2, HandHeart, CreditCard,
  Pencil, Timer, Send, X, Loader2, AlertTriangle, FileText, ExternalLink // <- Ajout de ExternalLink
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
  open, onOpenChange, booking, hotel, onEdit, onSendPaymentLink,
}: BookingDetailDialogProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const queryClient = useQueryClient();

  const { data: userRole } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
      if (error) throw error;
      return data?.role;
    },
  });

  const isConcierge = userRole === 'concierge';

  const canCancel =
    booking?.payment_status !== 'paid' && booking?.payment_status !== 'charged_to_room' &&
    booking?.status !== 'cancelled' && booking?.status !== 'completed' &&
    (userRole === 'admin' || userRole === 'concierge');

  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!booking?.id) throw new Error("Booking ID manquant");
      const { data, error } = await supabase.from("bookings").update({ status: "cancelled", cancellation_reason: reason }).eq("id", booking.id).select().single();
      if (error) throw error;
      if (!data) throw new Error("Échec de la mise à jour");
      return data;
    },
    onSuccess: async () => {
      if (booking?.id) {
        try { await invokeEdgeFunction("handle-booking-cancellation", { body: { bookingId: booking.id, cancellationReason: cancellationReason || undefined } }); } catch (e) { console.error(e); }
      }
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({ title: "Succès", description: "La réservation a été annulée avec succès" });
      setShowCancelDialog(false);
      setCancellationReason("");
      onOpenChange(false);
    },
  });

  if (!booking) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold">Réservation #{booking.booking_id}</DialogTitle>
              <div className="flex items-center gap-2 mt-2">
                <StatusBadge status={booking.status} type="booking" />
                {!isConcierge && booking.status !== "quote_pending" && booking.status !== "waiting_approval" && (
                  <StatusBadge status={booking.payment_status || "pending"} type="payment" />
                )}
              </div>
            </div>
            <ButtonGroup className="pr-10">
              {/* Boutons (Paiement, Annuler, Editer) inchangés... */}
              {canCancel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-destructive" onClick={() => setShowCancelDialog(true)}><X className="h-4 w-4" /></Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Annuler</TooltipContent>
                </Tooltip>
              )}
            </ButtonGroup>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2 overflow-y-auto flex-1">
          {/* 1. Client Info */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2"><User className="h-4 w-4" />Client</h3>
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{booking.client_first_name} {booking.client_last_name}</span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{booking.phone}</div>
                {booking.client_email && <div className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{booking.client_email}</div>}
                {booking.room_number && <div className="flex items-center gap-1"><DoorOpen className="h-3.5 w-3.5" />Chambre {booking.room_number}</div>}
              </div>
            </div>
          </div>

          <Separator />

          {/* 2. TICKET S1-04 : Statut de la signature */}
          {!isConcierge && (
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Décharge de responsabilité
            </h3>
            <div className={`rounded-lg p-3 border ${
              (booking as any).signed_at 
                ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900' 
                : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-900'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className={`text-sm font-medium ${
                    (booking as any).signed_at ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400'
                  }`}>
                    {(booking as any).signed_at 
                      ? `✅ Signée le ${format(new Date((booking as any).signed_at), "dd/MM/yyyy à HH:mm", { locale: fr })}` 
                      : '⏳ En attente de signature'}
                  </p>
                  {!(booking as any).signed_at && (booking as any).signature_token && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Le client doit signer sur la tablette avant le soin.
                    </p>
                  )}
                </div>
                {/* NOUVEAU BOUTON D'OUVERTURE DE LIEN */}
                {(booking as any).signature_token && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      const url = `${window.location.origin}/sign/${(booking as any).signature_token}`;
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ouvrir le formulaire
                  </Button>
                )}
              </div>
            </div>
          </div>
          )}

          {!isConcierge && <Separator />}

          {/* 3. Booking Details */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2"><Calendar className="h-4 w-4" />Réservation</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Calendar className="h-3.5 w-3.5" />Date</div>
                <p className="font-medium">{format(new Date(booking.booking_date), "EEEE d MMMM yyyy", { locale: fr })}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Clock className="h-3.5 w-3.5" />Heure</div>
                <p className="font-medium">{booking.booking_time.substring(0, 5)}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* 4. Treatments */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2"><HandHeart className="h-4 w-4" />Soins ({booking.treatments.length})</h3>
            {booking.treatments.length > 0 ? (
              <div className="space-y-2">
                {booking.treatments.map((t, i) => (
                  <div key={i} className="flex justify-between bg-muted/50 rounded-lg p-3">
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="font-medium">{formatPrice(t.price, hotel?.currency || 'EUR')}</span>
                  </div>
                ))}
              </div>
            ) : (<p className="text-sm text-muted-foreground">Aucun soin</p>)}
          </div>
        </div>

        <DialogFooter className="mt-4 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}