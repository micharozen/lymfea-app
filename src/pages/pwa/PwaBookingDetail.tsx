import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Clock, MapPin, Phone, User, Check } from "lucide-react";
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-black text-white p-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pwa/bookings")}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Réservation #{booking.booking_id}</h1>
            <p className="text-sm text-gray-300">
              {format(new Date(booking.booking_date), "PPP", { locale: fr })}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Status Badge */}
        <div className="flex justify-center">
          <span
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              booking.status === "Terminé"
                ? "bg-green-500/10 text-green-700"
                : booking.status === "En cours"
                ? "bg-blue-500/10 text-blue-700"
                : "bg-orange-500/10 text-orange-700"
            }`}
          >
            {booking.status}
          </span>
        </div>

        {/* Client Info */}
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <User className="h-5 w-5" />
            Informations client
          </h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Nom : </span>
              <span className="font-medium">
                {booking.client_first_name} {booking.client_last_name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{booking.phone}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>
                {booking.hotel_name}
                {booking.room_number && ` - Chambre ${booking.room_number}`}
              </span>
            </div>
          </div>
        </Card>

        {/* Booking Info */}
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Détails de la réservation
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{format(new Date(booking.booking_date), "PPP", { locale: fr })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{booking.booking_time}</span>
            </div>
          </div>
        </Card>

        {/* Treatments */}
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Prestations</h2>
          <div className="space-y-3">
            {treatments.map((treatment) => (
              <div
                key={treatment.id}
                className="flex justify-between items-start p-3 bg-muted/50 rounded-lg"
              >
                <div>
                  <div className="font-medium">{treatment.treatment_menus.name}</div>
                  {treatment.treatment_menus.description && (
                    <div className="text-sm text-muted-foreground">
                      {treatment.treatment_menus.description}
                    </div>
                  )}
                  {treatment.treatment_menus.duration && (
                    <div className="text-sm text-muted-foreground">
                      {treatment.treatment_menus.duration} min
                    </div>
                  )}
                </div>
                <div className="font-semibold">{treatment.treatment_menus.price}€</div>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t flex justify-between items-center">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-bold">{booking.total_price}€</span>
          </div>
        </Card>

        {/* Status Actions */}
        {booking.status !== "Terminé" && (
          <div className="space-y-3">
            {booking.status === "En attente" && (
              <Button
                onClick={() => handleUpdateStatus("En cours")}
                disabled={updating}
                className="w-full"
                size="lg"
              >
                {updating ? "Mise à jour..." : "Démarrer la prestation"}
              </Button>
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
        )}
      </div>
    </div>
  );
};

export default PwaBookingDetail;
