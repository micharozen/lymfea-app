import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Calendar, Clock, Timer, Euro, Phone, Mail, MoreVertical, Trash2, Navigation, X, User, Hotel, MessageCircle } from "lucide-react";
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
  declined_by?: string[];
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
  const location = useLocation();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showAddTreatmentDialog, setShowAddTreatmentDialog] = useState(false);
  
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [treatmentToDelete, setTreatmentToDelete] = useState<string | null>(null);
  const [conciergeContact, setConciergeContact] = useState<ConciergeContact | null>(null);
  const [adminContact, setAdminContact] = useState<AdminContact | null>(null);
  const [hairdresserProfile, setHairdresserProfile] = useState<any>(null);
  const [showNavigationDrawer, setShowNavigationDrawer] = useState(false);

  useEffect(() => {
    fetchBookingDetail();

    // Set up real-time subscriptions
    const bookingChannel = supabase
      .channel('booking-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${id}`
        },
        () => {
          fetchBookingDetail();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_treatments',
          filter: `booking_id=eq.${id}`
        },
        () => {
          fetchBookingDetail();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingChannel);
    };
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
          status: "En attente de validation",
          updated_at: new Date().toISOString()
        })
        .eq("id", booking.id);

      if (error) throw error;

      toast.success("Demande de validation envoyée à l'admin");
      setShowCompleteDialog(false);
      fetchBookingDetail();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur");
    } finally {
      setUpdating(false);
    }
  };


  const handleUnassignBooking = async () => {
    if (!booking) return;
    
    setUpdating(true);
    try {
      // Get current user to add to declined_by array
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: hairdresserData } = await supabase
        .from("hairdressers")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!hairdresserData) return;

      // Get current declined_by array
      const { data: currentBooking } = await supabase
        .from("bookings")
        .select("declined_by")
        .eq("id", booking.id)
        .single();

      const currentDeclined = currentBooking?.declined_by || [];
      const updatedDeclined = [...currentDeclined, hairdresserData.id];

      const { error } = await supabase
        .from("bookings")
        .update({ 
          status: "En attente",
          hairdresser_id: null,
          hairdresser_name: null,
          assigned_at: null,
          declined_by: updatedDeclined,
          updated_at: new Date().toISOString()
        })
        .eq("id", booking.id);

      if (error) throw error;

      toast.success("Réservation remise en attente pour d'autres coiffeurs");
      setShowUnassignDialog(false);
      navigate("/pwa/dashboard");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur");
    } finally {
      setUpdating(false);
    }
  };

  const handleAcceptBooking = async () => {
    console.log('[Booking] 🚀 BUTTON CLICKED - Function called!');
    
    if (!booking) {
      console.log('[Booking] ❌ No booking data');
      return;
    }
    
    console.log('[Booking] ✅ Booking exists:', booking.id);
    setUpdating(true);
    
    try {
      console.log('[Booking] 🎯 Starting accept booking process...');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[Booking] ❌ No user found');
        toast.error('Non authentifié');
        setUpdating(false);
        return;
      }

      console.log('[Booking] 👤 User authenticated:', user.id);
      const { data: hairdresserData } = await supabase
        .from("hairdressers")
        .select("id, first_name, last_name")
        .eq("user_id", user.id)
        .single();

      if (!hairdresserData) {
        console.error('[Booking] ❌ No hairdresser found for user');
        toast.error('Profil coiffeur non trouvé');
        setUpdating(false);
        return;
      }

      console.log('[Booking] 💇 Hairdresser found:', hairdresserData.id);

      // Check for conflicts with existing confirmed bookings
      console.log('[Booking] 🔍 Checking for schedule conflicts...');
      const { data: existingBookings } = await supabase
        .from("bookings")
        .select(`
          *,
          booking_treatments (
            treatment_menus (
              duration
            )
          )
        `)
        .eq("hairdresser_id", hairdresserData.id)
        .eq("booking_date", booking.booking_date)
        .in("status", ["Confirmé", "Assigné"]);

      console.log('[Booking] 📅 Existing bookings:', existingBookings?.length || 0);

      if (existingBookings && existingBookings.length > 0) {
        const newBookingStart = new Date(`${booking.booking_date}T${booking.booking_time}`);
        const newBookingDuration = treatments.reduce((sum, t) => sum + (t.treatment_menus?.duration || 0), 0);
        const newBookingEnd = new Date(newBookingStart.getTime() + newBookingDuration * 60000);

        for (const existingBooking of existingBookings) {
          const existingStart = new Date(`${existingBooking.booking_date}T${existingBooking.booking_time}`);
          const existingDuration = existingBooking.booking_treatments.reduce(
            (sum: number, bt: any) => sum + (bt.treatment_menus?.duration || 0), 
            0
          );
          const existingEnd = new Date(existingStart.getTime() + existingDuration * 60000);

          // Check if bookings overlap
          if (
            (newBookingStart >= existingStart && newBookingStart < existingEnd) ||
            (newBookingEnd > existingStart && newBookingEnd <= existingEnd) ||
            (newBookingStart <= existingStart && newBookingEnd >= existingEnd)
          ) {
            console.warn('[Booking] ⚠️ Schedule conflict detected');
            toast.error(
              `⚠️ Conflit d'horaire détecté avec une réservation existante à ${existingBooking.booking_time.substring(0, 5)}`
            );
            setUpdating(false);
            return;
          }
        }
      }

      const totalPrice = treatments.reduce((sum, t) => sum + (t.treatment_menus?.price || 0), 0);
      console.log('[Booking] 💰 Total price:', totalPrice);
      
      console.log('[Booking] 📞 Calling accept_booking RPC...');
      const { data, error } = await supabase.rpc('accept_booking', {
        _booking_id: booking.id,
        _hairdresser_id: hairdresserData.id,
        _hairdresser_name: `${hairdresserData.first_name} ${hairdresserData.last_name}`,
        _total_price: totalPrice
      });

      console.log('[Booking] 📥 RPC response:', { data, error });
      console.log('[Booking] 📦 Data content:', data);

      if (error) {
        console.error('[Booking] ❌ RPC error:', error);
        throw error;
      }

      const result = data as { success: boolean; error?: string; data?: any } | null;
      console.log('[Booking] 🔍 Parsed result:', result);
      console.log('[Booking] ✅ Result success?', result?.success);
      
      if (result && !result.success) {
        console.log('[Booking] ❌ Booking already taken by another hairdresser');
        toast.error("Réservation déjà prise par un autre coiffeur");
        navigate("/pwa/dashboard");
        return;
      }

      console.log('[Booking] 🎉 Booking accepted successfully!');
      
      // Trigger email notifications to admins and concierges
      try {
        console.log('[Booking] 📧 Sending email notifications...');
        await supabase.functions.invoke('notify-booking-confirmed', {
          body: { bookingId: booking.id }
        });
        console.log('[Booking] 📧 Email notifications sent');
      } catch (notifError) {
        console.error('[Booking] ⚠️ Email notification error (non-blocking):', notifError);
      }
      
      toast.success("Réservation acceptée !");
      navigate("/pwa/dashboard");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur lors de l'acceptation");
    } finally {
      setUpdating(false);
    }
  };

  const handleDeclineBooking = async () => {
    if (!booking) return;
    
    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: hairdresserData } = await supabase
        .from("hairdressers")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!hairdresserData) return;

      const { data: currentBooking } = await supabase
        .from("bookings")
        .select("declined_by")
        .eq("id", booking.id)
        .single();

      const currentDeclined = currentBooking?.declined_by || [];
      const updatedDeclined = [...currentDeclined, hairdresserData.id];

      const { error } = await supabase
        .from("bookings")
        .update({ declined_by: updatedDeclined })
        .eq("id", booking.id);

      if (error) throw error;

      toast.success("Réservation refusée");
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

  const openInMaps = (app: 'apple' | 'google' | 'waze') => {
    if (!booking) return;
    
    const address = `8 Rue Louis Armand, 75015 Paris`;
    const coords = '48.8415,2.2886'; // Coordinates for the address
    
    let url = '';
    
    switch (app) {
      case 'apple':
        url = `maps://maps.apple.com/?q=${encodeURIComponent(address)}`;
        break;
      case 'google':
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        break;
      case 'waze':
        url = `https://waze.com/ul?ll=${coords}&navigate=yes`;
        break;
    }
    
    window.open(url, '_blank');
    setShowNavigationDrawer(false);
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
    if (booking.status === "En attente de validation") {
      return <Badge variant="outline" className="border-primary text-primary bg-primary/10">Waiting validation</Badge>;
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
          <button 
            onClick={() => {
              const from = (location.state as any)?.from;
              navigate(from === 'notifications' ? '/pwa/notifications' : '/pwa/dashboard');
            }} 
            className="p-1"
          >
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
              onClick={() => setShowNavigationDrawer(true)}
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

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-muted-foreground">
                <User className="w-5 h-5" />
                <span className="text-sm">Name</span>
              </div>
              <span className="text-sm font-medium text-foreground">
                {booking.client_first_name} {booking.client_last_name}
              </span>
            </div>

            {booking.room_number && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Hotel className="w-5 h-5" />
                  <span className="text-sm">Room</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {booking.room_number}
                </span>
              </div>
            )}
          </div>

          {/* Treatments */}
          <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Treatments</h3>
            {(booking.status === "Assigné" || booking.status === "Confirmé") && (
              <button
                onClick={() => setShowAddTreatmentDialog(true)}
                className="text-sm text-primary hover:text-primary/80 font-medium transition-all active:scale-95"
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
                  {(booking.status !== "Complété" && booking.status !== "En attente") && (
                    <button
                      onClick={() => setTreatmentToDelete(treatment.id)}
                      className="p-1 hover:bg-destructive/10 rounded transition-all active:scale-95"
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
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-6 py-4 z-10">
          <div className="flex items-center gap-3">
            {/* For Pending Requests (not assigned to anyone) */}
            {booking.status === "En attente" && !booking.hairdresser_id ? (
              <>
                {/* Decline Button */}
                <button
                  onClick={() => setShowDeclineDialog(true)}
                  disabled={updating}
                  className="w-12 h-12 rounded-full border-2 border-destructive flex items-center justify-center bg-background hover:bg-destructive/10 disabled:opacity-50 transition-all active:scale-95"
                >
                  <X className="w-5 h-5 text-destructive" />
                </button>

                {/* More Options Button */}
                <Drawer>
                  <DrawerTrigger asChild>
                    <button className="w-12 h-12 rounded-full border border-border flex items-center justify-center bg-background hover:bg-muted transition-all active:scale-95">
                      <MoreVertical className="w-5 h-5 text-foreground" />
                    </button>
                  </DrawerTrigger>
                  <DrawerContent className="pb-safe">
                    <div className="p-6 space-y-2">
                      {conciergeContact && (
                        <a
                          href={`https://wa.me/${conciergeContact.country_code}${conciergeContact.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                        >
                          <Phone className="w-5 h-5 text-primary" />
                          <span className="text-base font-medium">Contacter concierge</span>
                        </a>
                      )}
                      <a
                        href={`https://wa.me/${booking.phone.startsWith('+') ? booking.phone.substring(1) : booking.phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Phone className="w-5 h-5 text-primary" />
                        <span className="text-base font-medium">Contacter le client</span>
                      </a>
                      <a
                        href="https://wa.me/33769627754"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                      >
                        <MessageCircle className="w-5 h-5 text-[#25D366]" />
                        <span className="text-base font-medium">Contacter OOM</span>
                      </a>
                    </div>
                  </DrawerContent>
                </Drawer>

                {/* Accept Button */}
                <button
                  onClick={handleAcceptBooking}
                  disabled={updating}
                  className="flex-1 bg-primary text-primary-foreground rounded-full py-3 px-6 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  Accepter
                </button>
              </>
            ) : (
              /* For Accepted Bookings */
              <>
                {/* Contact Drawer */}
                <Drawer open={showContactDrawer} onOpenChange={setShowContactDrawer}>
                  <DrawerTrigger asChild>
                    <button className="w-12 h-12 rounded-full border border-border flex items-center justify-center bg-background hover:bg-muted transition-all active:scale-95">
                      <MoreVertical className="w-5 h-5 text-foreground" />
                    </button>
                  </DrawerTrigger>
                  <DrawerContent className="pb-safe">
                    <div className="p-6 space-y-2">
                      {conciergeContact && (
                        <a
                          href={`https://wa.me/${conciergeContact.country_code}${conciergeContact.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setShowContactDrawer(false)}
                          className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                        >
                          <Phone className="w-5 h-5 text-primary" />
                          <span className="text-base font-medium">Contacter concierge</span>
                        </a>
                      )}
                      <a
                        href={`https://wa.me/${booking.phone.startsWith('+') ? booking.phone.substring(1) : booking.phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowContactDrawer(false)}
                        className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Phone className="w-5 h-5 text-primary" />
                        <span className="text-base font-medium">Contacter le client</span>
                      </a>
                      <a
                        href="https://wa.me/33769627754"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowContactDrawer(false)}
                        className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors"
                      >
                        <MessageCircle className="w-5 h-5 text-[#25D366]" />
                        <span className="text-base font-medium">Contacter OOM</span>
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
                        <span className="text-base font-medium text-destructive">Se désister de la réservation</span>
                      </button>
                    </div>
                  </DrawerContent>
                </Drawer>

                {/* Main Action Button */}
                {booking.status === "Assigné" || booking.status === "Confirmé" ? (
                  <button
                    onClick={() => setShowCompleteDialog(true)}
                    disabled={updating}
                    className="flex-1 bg-primary text-primary-foreground rounded-full py-3 px-6 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                  >
                    Request to mark complete
                  </button>
                ) : booking.status === "En attente de validation" ? (
                  <button
                    disabled
                    className="flex-1 bg-primary/50 text-primary-foreground rounded-full py-3 px-6 text-sm font-medium cursor-not-allowed"
                  >
                    En attente de validation admin
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation App Selector Drawer */}
      <Drawer open={showNavigationDrawer} onOpenChange={setShowNavigationDrawer}>
        <DrawerContent className="pb-safe">
          <div className="p-6 space-y-2">
            <h3 className="text-lg font-semibold mb-4">Choisir une application</h3>
            <button
              onClick={() => openInMaps('apple')}
              className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors w-full text-left"
            >
              <Navigation className="w-5 h-5 text-primary" />
              <span className="text-base font-medium">Apple Maps</span>
            </button>
            <button
              onClick={() => openInMaps('google')}
              className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors w-full text-left"
            >
              <Navigation className="w-5 h-5 text-primary" />
              <span className="text-base font-medium">Google Maps</span>
            </button>
            <button
              onClick={() => openInMaps('waze')}
              className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted transition-colors w-full text-left"
            >
              <Navigation className="w-5 h-5 text-primary" />
              <span className="text-base font-medium">Waze</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

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
            <AlertDialogTitle>Demander la validation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Une notification sera envoyée à l'admin pour valider la complétion de cette réservation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkComplete} disabled={updating}>
              Envoyer la demande
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
            <AlertDialogTitle>Se désister de la réservation ?</AlertDialogTitle>
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
              Oui, me désister
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decline Booking Confirmation Dialog */}
      <AlertDialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refuser cette réservation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir refuser cette réservation ? Elle restera visible pour les autres coiffeurs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeclineBooking}
              disabled={updating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Oui, refuser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PwaBookingDetail;
