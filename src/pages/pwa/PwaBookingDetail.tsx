import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Calendar, Clock, Timer, Euro, Phone, Mail, MoreVertical, Trash2, Navigation, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AddTreatmentDialog } from "./AddTreatmentDialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
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

interface Booking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  hotel_name: string;
  hotel_id: string;
  room_number: string;
  status: string;
  phone: string;
  total_price: number;
  hairdresser_id: string | null;
  hotel_image_url?: string;
  hotel_address?: string;
  hotel_city?: string;
}

interface Treatment {
  id: string;
  treatment_id: string;
  treatment_menus: {
    name: string;
    description: string;
    duration: number;
    price: number;
    image?: string;
  } | null;
}

interface ConciergeContact {
  phone: string;
  country_code: string;
  first_name: string;
  last_name: string;
}

interface AdminContact {
  phone: string;
  country_code: string;
  first_name: string;
  last_name: string;
}

const PwaBookingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showAddTreatmentDialog, setShowAddTreatmentDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [treatmentToDelete, setTreatmentToDelete] = useState<string | null>(null);
  const [conciergeContact, setConciergeContact] = useState<ConciergeContact | null>(null);
  const [adminContact, setAdminContact] = useState<AdminContact | null>(null);
  const [hairdresserProfile, setHairdresserProfile] = useState<any>(null);

  useEffect(() => {
    fetchBookingDetail();
  }, [id]);

  const fetchBookingDetail = async () => {
    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .single();

      if (bookingError) throw bookingError;

      // Fetch hotel data
      let hotelData = null;
      if (bookingData.hotel_id) {
        const { data: hotel } = await supabase
          .from("hotels")
          .select("image, address, city")
          .eq("id", bookingData.hotel_id)
          .single();
        hotelData = hotel;
      }
      
      const bookingWithHotel = {
        ...bookingData,
        hotel_image_url: hotelData?.image,
        hotel_address: hotelData?.address,
        hotel_city: hotelData?.city
      };
      setBooking(bookingWithHotel);

      // Fetch treatments
      const { data: treatmentsData, error: treatmentsError } = await supabase
        .from("booking_treatments")
        .select(`
          *,
          treatment_menus (
            name,
            description,
            duration,
            price,
            image
          )
        `)
        .eq("booking_id", id);

      if (!treatmentsError && treatmentsData) {
        setTreatments(treatmentsData as any);
      }

      // Fetch hairdresser profile if assigned
      if (bookingData.hairdresser_id) {
        const { data: hairdresserData } = await supabase
          .from("hairdressers")
          .select("profile_image, first_name, last_name")
          .eq("id", bookingData.hairdresser_id)
          .single();
        
        if (hairdresserData) {
          setHairdresserProfile(hairdresserData);
        }
      }

      // Fetch concierge contact
      const { data: conciergeData } = await supabase
        .from("concierge_hotels")
        .select(`
          concierges (
            phone,
            country_code,
            first_name,
            last_name
          )
        `)
        .eq("hotel_id", bookingData.hotel_id)
        .limit(1)
        .maybeSingle();

      if (conciergeData && conciergeData.concierges) {
        setConciergeContact(conciergeData.concierges as any);
      }

      // Fetch admin contact
      const { data: adminData } = await supabase
        .from("admins")
        .select("phone, country_code, first_name, last_name")
        .eq("status", "Actif")
        .limit(1)
        .maybeSingle();

      if (adminData) {
        setAdminContact(adminData);
      }
    } catch (error) {
      console.error("Error fetching booking:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!booking) return;
    
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ 
          status: "Complété",
          updated_at: new Date().toISOString()
        })
        .eq("id", booking.id);

      if (error) throw error;

      toast.success("Réservation marquée comme complétée");
      setShowCompleteDialog(false);
      fetchBookingDetail();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur");
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!booking) return;
    
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ 
          status: "Annulé",
          cancellation_reason: "Annulé par le coiffeur"
        })
        .eq("id", booking.id);

      if (error) throw error;

      toast.success("Réservation annulée");
      navigate("/pwa/dashboard");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur");
    }
  };

  const handleUnassignBooking = async () => {
    if (!booking) return;
    
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ 
          status: "En attente",
          hairdresser_id: null,
          hairdresser_name: null,
          assigned_at: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", booking.id);

      if (error) throw error;

      toast.success("Réservation remise en attente");
      setShowUnassignDialog(false);
      navigate("/pwa/dashboard");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur");
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteTreatment = async (treatmentId: string) => {
    try {
      const { error } = await supabase
        .from("booking_treatments")
        .delete()
        .eq("id", treatmentId);

      if (error) throw error;

      toast.success("Traitement supprimé");
      setTreatmentToDelete(null);
      fetchBookingDetail();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const openInMaps = () => {
    if (!booking) return;
    
    const address = `8 Rue Louis Armand, 75015 Paris`;
    
    // Use native map URI that works on all platforms
    window.location.href = `maps://maps.apple.com/?q=${encodeURIComponent(address)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Booking not found</div>
      </div>
    );
  }

  const totalDuration = treatments.reduce((sum, t) => sum + (t.treatment_menus?.duration || 0), 0);
  const totalPrice = treatments.reduce((sum, t) => sum + (t.treatment_menus?.price || 0), 0);

  const getStatusBadge = () => {
    if (booking.status === "En attente") {
      return <Badge variant="outline" className="border-warning text-warning-foreground bg-warning/10">Treatment ongoing</Badge>;
    }
    if (booking.status === "Assigné" || booking.status === "Confirmé") {
      return <Badge variant="outline" className="border-warning text-warning-foreground bg-warning/10">Treatment ongoing</Badge>;
    }
    if (booking.status === "Complété") {
      return <Badge variant="outline" className="border-success text-success-foreground bg-success/10">Completed</Badge>;
    }
    return null;
  };

  return (
    <>
      <div className="min-h-screen bg-background pb-24">
        {/* Header */}
        <div className="bg-background px-4 py-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
          <button onClick={() => navigate("/pwa/dashboard")} className="p-1">
            <ChevronLeft className="w-6 h-6 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground">My booking</h1>
          <div className="w-6" />
        </div>

        <div className="px-6 pt-6">
          {/* Hotel Image */}
          <div className="relative w-24 h-24 mx-auto mb-4">
            {booking.hotel_image_url ? (
              <img 
                src={booking.hotel_image_url} 
                alt={booking.hotel_name}
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              <div className="w-full h-full bg-muted rounded-2xl" />
            )}
          </div>

          {/* Status Badge */}
          {getStatusBadge() && (
            <div className="flex justify-center mb-4">
              {getStatusBadge()}
            </div>
          )}

          {/* Hotel Name */}
          <div className="text-center mb-2">
            <h2 className="font-semibold text-lg text-foreground">{booking.hotel_name}</h2>
          </div>

          {/* Address */}
          <div className="text-center mb-6">
            <button 
              onClick={openInMaps}
              className="text-sm text-muted-foreground flex items-center justify-center gap-1 hover:text-foreground transition-colors mx-auto"
            >
              <Navigation className="w-3.5 h-3.5" />
              8 Rue Louis Armand, 75015 Paris
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </button>
          </div>

          {/* Details */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Calendar className="w-5 h-5" />
                <span className="text-sm">Date</span>
              </div>
              <span className="text-sm font-medium text-foreground">
                {format(new Date(booking.booking_date), "d MMMM yyyy")}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Clock className="w-5 h-5" />
                <span className="text-sm">Time</span>
              </div>
              <span className="text-sm font-medium text-foreground">
                {booking.booking_time.substring(0, 5)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Timer className="w-5 h-5" />
                <span className="text-sm">Duration</span>
              </div>
              <span className="text-sm font-medium text-foreground">
                {totalDuration} Min
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Euro className="w-5 h-5" />
                <span className="text-sm">Price</span>
              </div>
              <span className="text-sm font-medium text-foreground">
                {totalPrice}€
              </span>
            </div>
          </div>

          {/* Treatments */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Treatments</h3>
              {(booking.status === "Assigné" || booking.status === "Confirmé" || booking.status === "En attente") && (
                <button
                  onClick={() => setShowAddTreatmentDialog(true)}
                  className="text-sm text-primary hover:text-primary/80 font-medium"
                >
                  + Ajouter
                </button>
              )}
            </div>
            {treatments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun traitement ajouté</p>
            ) : (
              <div className="space-y-3">
                {treatments.map((treatment) => (
                  <div key={treatment.id} className="flex items-start gap-3 group">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{treatment.treatment_menus?.name || 'Treatment'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {treatment.treatment_menus?.price || 0}€ • {treatment.treatment_menus?.duration || 0} min
                      </p>
                    </div>
                    {booking.status !== "Complété" && (
                      <button
                        onClick={() => setTreatmentToDelete(treatment.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-6 py-4">
          <div className="flex items-center gap-3">
            {/* Contact Drawer */}
            <Drawer open={showContactDrawer} onOpenChange={setShowContactDrawer}>
              <DrawerTrigger asChild>
                <button className="w-12 h-12 rounded-full border border-border flex items-center justify-center bg-background hover:bg-muted">
                  <MoreVertical className="w-5 h-5 text-foreground" />
                </button>
              </DrawerTrigger>
              <DrawerContent className="pb-safe">
                <div className="p-6 space-y-2">
                  {adminContact && (
                    <>
                      <a
                        href={`tel:${adminContact.country_code}${adminContact.phone}`}
                        onClick={() => setShowContactDrawer(false)}
                        className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Phone className="w-5 h-5 text-primary" />
                        <span className="text-base font-medium">Contacter OOM</span>
                      </a>
                      <a
                        href={`sms:${adminContact.country_code}${adminContact.phone}`}
                        onClick={() => setShowContactDrawer(false)}
                        className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Mail className="w-5 h-5 text-primary" />
                        <span className="text-base font-medium">SMS à OOM</span>
                      </a>
                    </>
                  )}
                  {conciergeContact && (
                    <>
                      <a
                        href={`tel:${conciergeContact.country_code}${conciergeContact.phone}`}
                        onClick={() => setShowContactDrawer(false)}
                        className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Phone className="w-5 h-5 text-primary" />
                        <span className="text-base font-medium">Contacter concierge</span>
                      </a>
                      <a
                        href={`sms:${conciergeContact.country_code}${conciergeContact.phone}`}
                        onClick={() => setShowContactDrawer(false)}
                        className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Mail className="w-5 h-5 text-primary" />
                        <span className="text-base font-medium">SMS au concierge</span>
                      </a>
                    </>
                  )}
                  <a
                    href={`tel:${booking.phone}`}
                    onClick={() => setShowContactDrawer(false)}
                    className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Phone className="w-5 h-5 text-primary" />
                    <span className="text-base font-medium">Contacter le client</span>
                  </a>
                  
                  <div className="h-px bg-border my-2" />
                  
                  <button
                    onClick={() => {
                      setShowContactDrawer(false);
                      setShowUnassignDialog(true);
                    }}
                    className="flex items-center gap-3 p-4 rounded-lg hover:bg-destructive/10 transition-colors w-full"
                  >
                    <X className="w-5 h-5 text-destructive" />
                    <span className="text-base font-medium text-destructive">Annuler la réservation</span>
                  </button>
                </div>
              </DrawerContent>
            </Drawer>

            {/* Main Action Button */}
            {booking.status === "Assigné" || booking.status === "Confirmé" || booking.status === "En attente" ? (
              <button
                onClick={() => setShowCompleteDialog(true)}
                disabled={updating}
                className="flex-1 bg-primary text-primary-foreground rounded-full py-3 px-6 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                Request to mark complete
              </button>
            ) : booking.status === "Complété" ? (
              <button
                onClick={() => setShowCancelDialog(true)}
                className="flex-1 bg-destructive text-destructive-foreground rounded-full py-3 px-6 text-sm font-medium hover:bg-destructive/90"
              >
                Annuler
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Add Treatment Dialog */}
      <AddTreatmentDialog
        open={showAddTreatmentDialog}
        onOpenChange={setShowAddTreatmentDialog}
        bookingId={booking.id}
        hotelId={booking.hotel_id}
        onTreatmentsAdded={fetchBookingDetail}
      />

      {/* Complete Confirmation Dialog */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marquer comme complétée ?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmez-vous que cette réservation est terminée ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkComplete} disabled={updating}>
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la réservation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir annuler cette réservation ? Cette action ne peut pas être annulée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Non, garder</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelBooking}>
              Oui, annuler
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Treatment Confirmation Dialog */}
      <AlertDialog open={!!treatmentToDelete} onOpenChange={() => setTreatmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le traitement ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce traitement ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => treatmentToDelete && handleDeleteTreatment(treatmentToDelete)}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unassign Booking Confirmation Dialog */}
      <AlertDialog open={showUnassignDialog} onOpenChange={setShowUnassignDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la réservation ?</AlertDialogTitle>
            <AlertDialogDescription>
              La réservation sera remise en attente et proposée à d'autres coiffeurs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Non, garder</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleUnassignBooking}
              disabled={updating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Oui, annuler
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PwaBookingDetail;
