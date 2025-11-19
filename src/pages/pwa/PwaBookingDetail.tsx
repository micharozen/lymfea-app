import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { ArrowLeft, Calendar, Clock, MapPin, Phone, User, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Booking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  hotel_name: string;
  room_number: string;
  status: string;
  phone: string;
  total_price: number;
}

interface Treatment {
  id: string;
  treatment_id: string;
  treatment_menus: {
    name: string;
    description: string;
    duration: number;
    price: number;
  };
}

const PwaBookingDetail = () => {
  const { id } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchBookingDetail();
  }, [id]);

  const fetchBookingDetail = async () => {
    try {
      // Fetch booking
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .single();

      if (bookingError) throw bookingError;
      setBooking(bookingData);

      // Fetch treatments
      const { data: treatmentsData, error: treatmentsError } = await supabase
        .from("booking_treatments")
        .select(`
          *,
          treatment_menus (
            name,
            description,
            duration,
            price
          )
        `)
        .eq("booking_id", id);

      if (!treatmentsError && treatmentsData) {
        setTreatments(treatmentsData as any);
      }
    } catch (error) {
      console.error("Error fetching booking:", error);
      toast.error("Erreur lors du chargement de la réservation");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptBooking = async () => {
    if (!booking) return;
    
    setShowConfirmDialog(false);
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "Confirmé" })
        .eq("id", booking.id);

      if (error) throw error;

      setBooking({ ...booking, status: "Confirmé" });
      setShowConfirmed(true);
      setTimeout(() => setShowConfirmed(false), 3000);
    } catch (error) {
      console.error("Error accepting booking:", error);
      toast.error("Erreur lors de l'acceptation");
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!booking) return;
    
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: newStatus })
        .eq("id", booking.id);

      if (error) throw error;

      toast.success(`Statut mis à jour : ${newStatus}`);
      setBooking({ ...booking, status: newStatus });
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-lg">Réservation introuvable</div>
        <Button onClick={() => navigate("/pwa/bookings")}>
          Retour aux réservations
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Booking Confirmed Toast */}
      {showConfirmed && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white rounded-lg shadow-lg px-6 py-3 flex items-center gap-2 animate-in slide-in-from-top">
          <Check className="h-5 w-5 text-green-600" />
          <span className="font-semibold">Booking Confirmed!</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-background border-b p-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pwa/dashboard")}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">
              {booking.status === "En attente" ? "Booking request" : `Booking #${booking.booking_id}`}
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Hotel Image Placeholder */}
        <div className="w-32 h-32 bg-muted rounded-lg flex items-center justify-center mx-auto">
          <div className="text-4xl">📦</div>
        </div>

        {/* Hotel Name and Date */}
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">{booking.hotel_name || "TEST"}</h2>
          <p className="text-blue-600 font-medium">
            {format(new Date(booking.booking_date), "EEE d MMMM", { locale: fr })} • {booking.booking_time}
          </p>
          <p className="text-muted-foreground">
            {treatments.reduce((total, t) => total + (t.treatment_menus.duration || 0), 0)} min
          </p>
        </div>

        {/* Booking details */}
        <div>
          <h3 className="text-xl font-bold mb-4">Booking details</h3>
          
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
              <MapPin className="h-10 w-10 p-2 bg-muted rounded-full" />
              <div>
                <div className="font-semibold">{booking.hotel_name || "TEST"}</div>
                <div className="text-sm text-muted-foreground">
                  {booking.room_number ? `Lane ${booking.room_number}` : "Lane 2"}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="h-10 w-10 p-2 bg-muted rounded-full flex items-center justify-center">
                💰
              </div>
              <div>
                <div className="font-semibold text-xl">€{booking.total_price || 0}</div>
                <div className="text-sm text-muted-foreground">Payout (This is what you get)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Treatments */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Treatments</h3>
            {booking.status === "Confirmé" && (
              <Button variant="ghost" size="icon">
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </div>
          
          <div className="space-y-3">
            {treatments.map((treatment) => (
              <div
                key={treatment.id}
                className="p-4 border-b last:border-b-0"
              >
                <div className="font-semibold text-lg">{treatment.treatment_menus.name}</div>
                <div className="text-sm text-muted-foreground">
                  {treatment.treatment_menus.duration} min
                </div>
              </div>
            ))}
          </div>
        </div>

        {booking.status === "Confirmé" && (
          <div>
            <h3 className="text-xl font-bold mb-4">Need help?</h3>
          </div>
        )}

        {/* Action Buttons */}
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-background border-t space-y-3">
          {booking.status === "En attente" && (
            <Button
              onClick={() => setShowConfirmDialog(true)}
              disabled={updating}
              className="w-full"
              size="lg"
            >
              Accept
            </Button>
          )}
          
          {booking.status === "Confirmé" && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add
              </Button>
              <Button
                size="lg"
                className="flex-1"
                onClick={() => handleUpdateStatus("En cours")}
                disabled={updating}
              >
                Sign bill
              </Button>
            </div>
          )}

          {booking.status === "En cours" && (
            <Button
              onClick={() => handleUpdateStatus("Terminé")}
              disabled={updating}
              className="w-full bg-green-600 hover:bg-green-700"
              size="lg"
            >
              <Check className="h-5 w-5 mr-2" />
              {updating ? "Mise à jour..." : "Marquer comme terminé"}
            </Button>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Please confirm again</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to accept this booking order. We will send you a notification reminder 1 hour before the booking start time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAcceptBooking}>
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PwaBookingDetail;
