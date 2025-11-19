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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface TreatmentMenu {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  service_for: string;
}

const PwaBookingDetail = () => {
  const { id } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [showAddTreatment, setShowAddTreatment] = useState(false);
  const [availableTreatments, setAvailableTreatments] = useState<TreatmentMenu[]>([]);
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchBookingDetail();
    fetchAvailableTreatments();
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

  const handleRejectBooking = async () => {
    if (!booking) return;
    
    setShowRejectDialog(false);
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "Refusé" })
        .eq("id", booking.id);

      if (error) throw error;

      toast.success("Réservation refusée");
      navigate("/pwa/bookings");
    } catch (error) {
      console.error("Error rejecting booking:", error);
      toast.error("Erreur lors du refus de la réservation");
    } finally {
      setUpdating(false);
    }
  };

  const fetchAvailableTreatments = async () => {
    try {
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("id, name, description, duration, price, service_for")
        .eq("status", "Actif")
        .order("name");

      if (!error && data) {
        setAvailableTreatments(data);
      }
    } catch (error) {
      console.error("Error fetching treatments:", error);
    }
  };

  const handleAddTreatments = async () => {
    if (!booking || selectedTreatments.length === 0) return;

    setUpdating(true);
    try {
      // Add selected treatments to booking
      const treatmentsToAdd = selectedTreatments.map(treatmentId => ({
        booking_id: booking.id,
        treatment_id: treatmentId,
      }));

      const { error } = await supabase
        .from("booking_treatments")
        .insert(treatmentsToAdd);

      if (error) throw error;

      // Calculate new total price
      const addedTreatments = availableTreatments.filter(t => 
        selectedTreatments.includes(t.id)
      );
      const additionalPrice = addedTreatments.reduce((sum, t) => sum + (t.price || 0), 0);
      const newTotalPrice = (booking.total_price || 0) + additionalPrice;

      // Update booking total price
      await supabase
        .from("bookings")
        .update({ total_price: newTotalPrice })
        .eq("id", booking.id);

      toast.success("Prestations ajoutées avec succès");
      setShowAddTreatment(false);
      setSelectedTreatments([]);
      fetchBookingDetail();
    } catch (error) {
      console.error("Error adding treatments:", error);
      toast.error("Erreur lors de l'ajout des prestations");
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

  const formatTime = (time: string) => {
    // Remove seconds from time format (14:30:00 -> 14:30)
    return time.substring(0, 5);
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
            {format(new Date(booking.booking_date), "EEE d MMMM", { locale: fr })} • {formatTime(booking.booking_time)}
          </p>
          <p className="text-muted-foreground">
            {treatments.reduce((total, t) => total + (t.treatment_menus?.duration || 0), 0)} min
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
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowAddTreatment(true)}
              >
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
                <div className="font-semibold text-lg">{treatment.treatment_menus?.name || "Prestation"}</div>
                <div className="text-sm text-muted-foreground">
                  {treatment.treatment_menus?.duration || 0} min
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
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowRejectDialog(true)}
                disabled={updating}
                className="flex-1"
                size="lg"
              >
                Reject
              </Button>
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={updating}
                className="flex-1"
                size="lg"
              >
                Accept
              </Button>
            </div>
          )}
          
          {booking.status === "Confirmé" && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setShowAddTreatment(true)}
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

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refuser la réservation</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir refuser cette réservation ? Cette action ne peut pas être annulée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRejectBooking} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Refuser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Treatment Dialog */}
      <Dialog open={showAddTreatment} onOpenChange={setShowAddTreatment}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Treatments</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="women" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="women">Women</TabsTrigger>
              <TabsTrigger value="men">Men</TabsTrigger>
            </TabsList>
            
            <TabsContent value="women" className="space-y-4 py-4">
              {availableTreatments
                .filter(t => t.service_for === "Femme")
                .map((treatment) => (
                  <div
                    key={treatment.id}
                    className="flex items-start gap-3 p-3 border rounded-lg"
                  >
                    <Checkbox
                      checked={selectedTreatments.includes(treatment.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTreatments([...selectedTreatments, treatment.id]);
                        } else {
                          setSelectedTreatments(selectedTreatments.filter(id => id !== treatment.id));
                        }
                      }}
                    />
                    <div className="flex-1">
                      <div className="font-semibold">{treatment.name}</div>
                      {treatment.description && (
                        <div className="text-sm text-muted-foreground">{treatment.description}</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1">
                        {treatment.duration} min • €{treatment.price}
                      </div>
                    </div>
                  </div>
                ))}
            </TabsContent>
            
            <TabsContent value="men" className="space-y-4 py-4">
              {availableTreatments
                .filter(t => t.service_for === "Homme")
                .map((treatment) => (
                  <div
                    key={treatment.id}
                    className="flex items-start gap-3 p-3 border rounded-lg"
                  >
                    <Checkbox
                      checked={selectedTreatments.includes(treatment.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTreatments([...selectedTreatments, treatment.id]);
                        } else {
                          setSelectedTreatments(selectedTreatments.filter(id => id !== treatment.id));
                        }
                      }}
                    />
                    <div className="flex-1">
                      <div className="font-semibold">{treatment.name}</div>
                      {treatment.description && (
                        <div className="text-sm text-muted-foreground">{treatment.description}</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1">
                        {treatment.duration} min • €{treatment.price}
                      </div>
                    </div>
                  </div>
                ))}
            </TabsContent>
          </Tabs>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddTreatment(false);
                setSelectedTreatments([]);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddTreatments}
              disabled={selectedTreatments.length === 0 || updating}
              className="flex-1"
            >
              {updating ? "Adding..." : `Add (${selectedTreatments.length})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PwaBookingDetail;
