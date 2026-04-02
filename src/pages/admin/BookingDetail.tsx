import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";

// UI Components
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
import { Loader2, ArrowLeft, User, Phone, Mail, DoorOpen, Calendar, Clock, Building2, HandHeart, CreditCard, Timer, Send, X, Pencil, AlertTriangle } from "lucide-react";

// Helpers
import { formatPrice } from "@/lib/formatPrice";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import EditBookingDialog from "@/components/EditBookingDialog";

export default function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPaymentLinkOpen, setIsPaymentLinkOpen] = useState(false);

  // 1. Fetch Booking Data
  const { data: booking, isLoading, error } = useQuery({
    queryKey: ["booking", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          booking_treatments (
            treatment_id,
            treatment_menus (
              name,
              price,
              duration
            )
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      // Transformation pour matcher le type BookingWithTreatments utilisé dans ton ancienne modale
      const treatments = data.booking_treatments?.map((bt: any) => ({
        name: bt.treatment_menus?.name,
        price: bt.treatment_menus?.price,
        duration: bt.treatment_menus?.duration,
      })) || [];

      const totalDuration = treatments.reduce((acc: number, t: any) => acc + (t.duration || 0), 0);

      return { ...data, treatments, totalDuration };
    },
  });

  // 2. User Role Check
  const { data: userRole } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
      return data?.role;
    },
  });

  // 3. Mutation pour l'annulation
  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled", cancellation_reason: reason })
        .eq("id", id);
      if (error) throw error;

      await invokeEdgeFunction("handle-booking-cancellation", {
        body: { bookingId: id, cancellationReason: reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking", id] });
      toast({ title: "Succès", description: "Réservation annulée" });
      setShowCancelDialog(false);
    },
  });

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !booking) return <div className="p-10 text-center">Erreur lors du chargement ou réservation introuvable.</div>;

  const canCancel =
    booking.payment_status !== 'paid' &&
    booking.payment_status !== 'charged_to_room' &&
    booking.status !== 'cancelled' &&
    booking.status !== 'completed' &&
    (userRole === 'admin' || userRole === 'concierge');

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-20">
      {/* HEADER STICKY */}
      <header className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Réservation #{booking.booking_id}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={booking.status} type="booking" />
              <StatusBadge status={booking.payment_status || "pending"} type="payment" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canCancel && (
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setShowCancelDialog(true)}>
              <X className="h-4 w-4 mr-2" /> Annuler
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setIsPaymentLinkOpen(true)}>
            <Send className="h-4 w-4 mr-2" /> Paiement
          </Button>
          <Button variant="default" size="sm" onClick={() => setIsEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Modifier
          </Button>
        </div>
      </header>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Colonne Gauche : Client & Booking */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Section Client */}
            <section className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 flex items-center gap-2">
                <User className="h-4 w-4" /> Client
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Nom complet</p>
                  <p className="font-medium text-lg">{booking.client_first_name} {booking.client_last_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Chambre</p>
                  <p className="font-medium flex items-center gap-2"><DoorOpen className="h-4 w-4 text-primary"/> {booking.room_number || "Non renseignée"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Téléphone</p>
                  <a href={`tel:${booking.phone}`} className="font-medium flex items-center gap-2 hover:underline text-primary"><Phone className="h-4 w-4"/> {booking.phone}</a>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <a href={`mailto:${booking.client_email}`} className="font-medium flex items-center gap-2 hover:underline text-primary"><Mail className="h-4 w-4"/> {booking.client_email || "N/A"}</a>
                </div>
              </div>
              {booking.client_note && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <p className="text-sm text-amber-800 italic">"{booking.client_note}"</p>
                </div>
              )}
            </section>

            {/* Section Soins */}
            <section className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 flex items-center gap-2">
                <HandHeart className="h-4 w-4" /> Soins réalisés
              </h3>
              <div className="space-y-3">
                {booking.treatments.map((t: any, i: number) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1"><Timer className="h-3 w-3"/> {t.duration} min</p>
                    </div>
                    <p className="font-semibold">{formatPrice(t.price, booking.currency || 'EUR')}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Colonne Droite : Infos Logistiques & Paiement */}
          <div className="space-y-6">
            <section className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4">Logistique</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Date</p>
                    <p className="text-sm font-medium">{format(new Date(booking.booking_date), "EEEE d MMMM", { locale: fr })}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Heure</p>
                    <p className="text-sm font-medium">{booking.booking_time.substring(0, 5)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Hôtel</p>
                    <p className="text-sm font-medium">{booking.hotel_name}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-primary text-white rounded-xl border p-6 shadow-lg">
              <h3 className="text-sm font-bold opacity-80 uppercase mb-4 flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Résumé Paiement
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm opacity-90">
                  <span>Méthode</span>
                  <span className="capitalize">{booking.payment_method || "Non défini"}</span>
                </div>
                <Separator className="bg-white/20" />
                <div className="flex justify-between items-baseline pt-2">
                  <span className="text-lg font-medium">Total</span>
                  <span className="text-2xl font-bold">{formatPrice(booking.total_price, booking.currency || 'EUR')}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* DIALOGS DE CONFIRMATION (Toujours utiles sur une page) */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la réservation ?</AlertDialogTitle>
            <AlertDialogDescription>Veuillez indiquer la raison. Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea 
            placeholder="Raison de l'annulation..." 
            value={cancellationReason} 
            onChange={(e) => setCancellationReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-white" 
              onClick={() => cancelMutation.mutate(cancellationReason)}
              disabled={!cancellationReason.trim() || cancelMutation.isPending}
            >
              Confirmer l'annulation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modale d'édition et lien de paiement */}
      <EditBookingDialog open={isEditOpen} onOpenChange={setIsEditOpen} booking={booking} />
      <SendPaymentLinkDialog open={isPaymentLinkOpen} onOpenChange={setIsPaymentLinkOpen} booking={booking} />
    </div>
  );
}