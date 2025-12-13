import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Calendar, Clock, Timer, Euro, Phone, MoreVertical, Trash2, Navigation, X, User, Hotel, MessageCircle, Pen, MessageSquare, Wallet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { AddTreatmentDialog } from "./AddTreatmentDialog";
import { InvoiceSignatureDialog } from "@/components/InvoiceSignatureDialog";
import { PaymentSelectionDrawer } from "@/components/pwa/PaymentSelectionDrawer";
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
  client_signature?: string | null;
  client_note?: string | null;
  client_email?: string | null;
  hotel_vat?: number;
  payment_status?: string | null;
  payment_method?: string | null;
  hairdresser_commission?: number;
}

const getPaymentStatusBadge = (paymentStatus?: string | null) => {
  if (!paymentStatus) return null;
  
  switch (paymentStatus) {
    case 'paid':
      return { label: 'Payé', className: 'bg-green-100 text-green-700' };
    case 'charged_to_room':
      return { label: 'Facturé chambre', className: 'bg-blue-100 text-blue-700' };
    case 'pending':
      return { label: 'En attente', className: 'bg-yellow-100 text-yellow-700' };
    case 'failed':
      return { label: 'Échoué', className: 'bg-red-100 text-red-700' };
    default:
      return null;
  }
};

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
  const { t } = useTranslation('pwa');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showAddTreatmentDialog, setShowAddTreatmentDialog] = useState(false);
  
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [treatmentToDelete, setTreatmentToDelete] = useState<string | null>(null);
  const [conciergeContact, setConciergeContact] = useState<ConciergeContact | null>(null);
  const [adminContact, setAdminContact] = useState<AdminContact | null>(null);
  const [hairdresserProfile, setHairdresserProfile] = useState<any>(null);
  const [showNavigationDrawer, setShowNavigationDrawer] = useState(false);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signingLoading, setSigningLoading] = useState(false);
  const [showPaymentSelection, setShowPaymentSelection] = useState(false);
  const [pendingRoomPayment, setPendingRoomPayment] = useState(false);
  const isAcceptingRef = useRef(false);

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
          // Don't refresh if we're in the middle of accepting
          if (!isAcceptingRef.current) {
            fetchBookingDetail();
          }
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
          // Don't refresh if we're in the middle of accepting
          if (!isAcceptingRef.current) {
            fetchBookingDetail();
          }
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

      // Fetch hotel data including commission
      let hotelData = null;
      if (bookingData.hotel_id) {
        const { data: hotel } = await supabase
          .from("hotels")
          .select("image, address, city, vat, hairdresser_commission")
          .eq("id", bookingData.hotel_id)
          .single();
        hotelData = hotel;
      }
      
      const bookingWithHotel = {
        ...bookingData,
        hotel_image_url: hotelData?.image,
        hotel_address: hotelData?.address,
        hotel_city: hotelData?.city,
        hotel_vat: hotelData?.vat || 20,
        hairdresser_commission: hotelData?.hairdresser_commission || 70
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
      toast.error(t('common:errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignatureConfirm = async (signatureData: string) => {
    if (!booking) return;
    
    setSigningLoading(true);
    try {
      // If this is a room payment flow, call finalize-payment
      if (pendingRoomPayment) {
        const { data, error } = await supabase.functions.invoke('finalize-payment', {
          body: {
            booking_id: booking.id,
            payment_method: 'room',
            final_amount: totalPrice,
            signature_data: signatureData,
          },
        });

        if (error) throw error;

        if (!data?.success) {
          throw new Error(data?.error || "Payment finalization failed");
        }

        toast.success("Prestation finalisée ! Votre paiement sera versé sous peu.");
        setShowSignatureDialog(false);
        setPendingRoomPayment(false);
        navigate("/pwa/dashboard", { state: { forceRefresh: true } });
        return;
      }

      // Legacy flow - direct signature without payment processing
      const { error } = await supabase
        .from("bookings")
        .update({ 
          client_signature: signatureData,
          signed_at: new Date().toISOString(),
          status: "Terminé",
          updated_at: new Date().toISOString()
        })
        .eq("id", booking.id);

      if (error) throw error;

      // Send rating email to client (non-blocking)
      if (booking.client_email) {
        supabase.functions.invoke('send-rating-email', {
          body: { bookingId: booking.id }
        }).catch(err => console.error("Rating email error:", err));
      }

      toast.success(t('bookingDetail.completed'));
      setShowSignatureDialog(false);
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || t('common:errors.generic'));
    } finally {
      setSigningLoading(false);
    }
  };

  const handleRoomPaymentSignature = () => {
    setPendingRoomPayment(true);
    setShowSignatureDialog(true);
  };

  const handlePaymentComplete = () => {
    toast.success("Paiement finalisé !");
    navigate("/pwa/dashboard", { state: { forceRefresh: true } });
  };

  const handleUnassignBooking = async () => {
    if (!booking) return;
    
    setUpdating(true);
    try {
      // Get current user's hairdresser ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: hairdresserData } = await supabase
        .from("hairdressers")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!hairdresserData) return;

      // Use RPC function to unassign booking (bypasses RLS issues)
      const { data, error } = await supabase.rpc('unassign_booking', {
        _booking_id: booking.id,
        _hairdresser_id: hairdresserData.id
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string } | null;
      if (result && !result.success) {
        toast.error(t('bookingDetail.notAssigned'));
        return;
      }

      toast.success(t('bookingDetail.unassigned'));
      setShowUnassignDialog(false);
      // Navigate with forceRefresh state to clear cache
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
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
    
    // Prevent double-clicks by checking if already updating (using both state and ref)
    if (updating || isAcceptingRef.current) {
      console.log('[Booking] ⏳ Already updating, ignoring click');
      return;
    }
    
    console.log('[Booking] ✅ Booking exists:', booking.id);
    isAcceptingRef.current = true;
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

      // Check for conflicts with existing bookings (exclude cancelled/completed)
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
        .not("status", "in", '("Annulé","Terminé")');

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
        navigate("/pwa/dashboard", { state: { forceRefresh: true } });
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
      
      toast.success(t('bookingDetail.accepted'));
      // Navigate with forceRefresh state to clear cache
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error) {
      console.error("Error:", error);
      toast.error(t('common:errors.generic'));
    } finally {
      isAcceptingRef.current = false;
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

      toast.success(t('bookingDetail.declined'));
      navigate("/pwa/dashboard", { state: { forceRefresh: true } });
    } catch (error) {
      console.error("Error:", error);
      toast.error(t('common:errors.generic'));
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

      toast.success(t('bookingDetail.treatmentDeleted'));
      setTreatmentToDelete(null);
      fetchBookingDetail();
    } catch (error) {
      console.error("Error:", error);
      toast.error(t('common:errors.generic'));
    }
  };

  const openInMaps = (app: 'apple' | 'google' | 'waze') => {
    if (!booking) return;
    
    // Use dynamic address from booking data
    const address = booking.hotel_address && booking.hotel_city 
      ? `${booking.hotel_address}, ${booking.hotel_city}`
      : booking.hotel_name || "Paris, France";
    
    let url = '';
    
    switch (app) {
      case 'apple':
        url = `maps://maps.apple.com/?q=${encodeURIComponent(address)}`;
        break;
      case 'google':
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        break;
      case 'waze':
        url = `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
        break;
    }
    
    window.open(url, '_blank');
    setShowNavigationDrawer(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">{t('common:loading')}</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">{t('bookingDetail.notFound')}</div>
      </div>
    );
  }

  const totalDuration = treatments.reduce((sum, t) => sum + (t.treatment_menus?.duration || 0), 0);
  const totalPrice = treatments.reduce((sum, t) => sum + (t.treatment_menus?.price || 0), 0);
  const estimatedEarnings = booking.hairdresser_commission 
    ? Math.round(totalPrice * (booking.hairdresser_commission / 100) * 100) / 100
    : 0;

  return (
    <>
      <div className="min-h-screen bg-background pb-20">
        {/* Header - Compact */}
        <div className="bg-background px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2 flex items-center justify-between sticky top-0 z-10 border-b border-border">
          <button 
            onClick={() => {
              const from = (location.state as any)?.from;
              navigate(from === 'notifications' ? '/pwa/notifications' : '/pwa/dashboard');
            }} 
            className="p-1.5 -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-sm font-semibold text-foreground">{t('bookingDetail.myBooking')}</h1>
          <div className="w-8" />
        </div>

        <div className="px-4 pt-3">
          {/* Hotel Header - Centered */}
          <div className="flex flex-col items-center mb-4">
            {/* Hotel Image - Centered */}
            <div className="w-16 h-16 mb-2">
              {booking.hotel_image_url ? (
                <img 
                  src={booking.hotel_image_url} 
                  alt={booking.hotel_name}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <div className="w-full h-full bg-muted rounded-xl" />
              )}
            </div>

            {/* Hotel Name */}
            <h2 className="font-semibold text-sm text-foreground text-center">{booking.hotel_name}</h2>
            
            {/* Address */}
            <button 
              onClick={() => setShowNavigationDrawer(true)}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors mt-0.5"
            >
              <Navigation className="w-3 h-3" />
              <span>
                {booking.hotel_address && booking.hotel_city 
                  ? `${booking.hotel_address}`
                  : booking.hotel_name}
              </span>
            </button>

            {/* Payment Status Badge */}
            {booking.payment_status && (
              <div className="mt-1.5">
                {(() => {
                  const badge = getPaymentStatusBadge(booking.payment_status);
                  return badge ? (
                    <Badge className={`text-[10px] px-2 py-0 h-4 ${badge.className}`}>
                      {badge.label}
                    </Badge>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* Details List - Vertical Uniform */}
          <div className="space-y-0 mb-3">
            <div className="flex items-center gap-3 py-2 border-b border-border/50">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground w-16">{t('booking.date')}</span>
              <span className="text-xs font-medium text-foreground ml-auto">
                {format(new Date(booking.booking_date), "d MMM yyyy")}
              </span>
            </div>

            <div className="flex items-center gap-3 py-2 border-b border-border/50">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground w-16">{t('booking.time')}</span>
              <span className="text-xs font-medium text-foreground ml-auto">
                {booking.booking_time.substring(0, 5)}
              </span>
            </div>

            <div className="flex items-center gap-3 py-2 border-b border-border/50">
              <Timer className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground w-16">{t('booking.duration')}</span>
              <span className="text-xs font-medium text-foreground ml-auto">{totalDuration} min</span>
            </div>

            <div className="flex items-center gap-3 py-2 border-b border-border/50">
              <Euro className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground w-16">{t('bookingDetail.price')}</span>
              <span className="text-xs font-medium text-foreground ml-auto">{totalPrice}€</span>
            </div>
          </div>

          {/* Earnings */}
          {estimatedEarnings > 0 && (
            <div className="flex items-center gap-3 py-2 border-b border-border/50 mb-3">
              <Wallet className="w-4 h-4 text-green-600 dark:text-green-500 flex-shrink-0" />
              <span className="text-xs text-green-600 dark:text-green-500 font-medium">Votre gain</span>
              <span className="text-xs font-bold text-green-600 dark:text-green-500 ml-auto">
                {estimatedEarnings}€
              </span>
            </div>
          )}

          {/* Client Info */}
          <div className="flex items-center gap-3 py-2 border-b border-border/50 mb-3">
            <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">
                {booking.client_first_name} {booking.client_last_name}
              </p>
              {booking.room_number && (
                <p className="text-[10px] text-muted-foreground">
                  {t('booking.room')}: {booking.room_number}
                </p>
              )}
            </div>
          </div>

          {/* Client Note */}
          {booking.client_note && (
            <div className="mb-3 p-2.5 bg-muted/50 rounded-lg">
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-foreground mb-0.5">Note du client</p>
                  <p className="text-xs text-muted-foreground">{booking.client_note}</p>
                </div>
              </div>
            </div>
          )}

          {/* Treatments */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-foreground">{t('booking.treatments')}</h3>
              {booking.status === "Assigné" && (
                <button
                  onClick={() => setShowAddTreatmentDialog(true)}
                  className="px-4 py-1 bg-foreground text-background font-medium text-[10px] rounded hover:bg-foreground/90 transition-all active:scale-[0.98]"
                >
                  + {t('bookingDetail.add')}
                </button>
              )}
            </div>
            {treatments.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('bookingDetail.noTreatments')}</p>
            ) : (
              <div className="space-y-1.5">
                {treatments.map((treatment) => (
                  <div key={treatment.id} className="flex items-center gap-2 group py-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{treatment.treatment_menus?.name || 'Treatment'}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {treatment.treatment_menus?.price || 0}€ • {treatment.treatment_menus?.duration || 0}min
                      </p>
                    </div>
                    {(booking.status !== "Terminé" && booking.status !== "En attente") && (
                      <button
                        onClick={() => setTreatmentToDelete(treatment.id)}
                        className="p-1 hover:bg-destructive/10 rounded transition-all active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions - Compact */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+6px)] z-10">
          <div className="flex items-center gap-2">
            {/* For Pending Requests (not assigned to anyone) */}
            {booking.status === "En attente" && !booking.hairdresser_id ? (
              <>
                {/* Decline Button */}
                <button
                  onClick={() => setShowDeclineDialog(true)}
                  disabled={updating}
                  className="w-10 h-10 rounded-full border-2 border-destructive flex items-center justify-center bg-background hover:bg-destructive/10 disabled:opacity-50 transition-all active:scale-95"
                >
                  <X className="w-4 h-4 text-destructive" />
                </button>

                {/* More Options Button */}
                <Drawer>
                  <DrawerTrigger asChild>
                    <button className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-background hover:bg-muted transition-all active:scale-95">
                      <MoreVertical className="w-4 h-4 text-foreground" />
                    </button>
                  </DrawerTrigger>
                  <DrawerContent className="pb-safe">
                    <div className="p-4 space-y-1">
                      {conciergeContact && (
                        <a
                          href={`https://wa.me/${conciergeContact.country_code}${conciergeContact.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-muted transition-colors"
                        >
                          <Phone className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">{t('bookingDetail.contactConcierge')}</span>
                        </a>
                      )}
                      <a
                        href={`https://wa.me/${booking.phone.startsWith('+') ? booking.phone.substring(1) : booking.phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Phone className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">{t('booking.contactClient')}</span>
                      </a>
                      <a
                        href="https://wa.me/33769627754"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <MessageCircle className="w-4 h-4 text-[#25D366]" />
                        <span className="text-sm font-medium">{t('bookingDetail.contactOOM')}</span>
                      </a>
                    </div>
                  </DrawerContent>
                </Drawer>

                {/* Accept Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAcceptBooking();
                  }}
                  disabled={updating}
                  className="flex-1 bg-primary text-primary-foreground rounded-full py-2.5 px-4 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {updating ? "..." : t('dashboard.accept')}
                </button>
              </>
            ) : (
              /* For Accepted Bookings */
              <>
                {/* Contact Drawer */}
                <Drawer open={showContactDrawer} onOpenChange={setShowContactDrawer}>
                  <DrawerTrigger asChild>
                    <button className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-background hover:bg-muted transition-all active:scale-95">
                      <MoreVertical className="w-4 h-4 text-foreground" />
                    </button>
                  </DrawerTrigger>
                  <DrawerContent className="pb-safe">
                    <div className="p-4 space-y-1">
                      {conciergeContact && (
                        <a
                          href={`https://wa.me/${conciergeContact.country_code}${conciergeContact.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setShowContactDrawer(false)}
                          className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-muted transition-colors"
                        >
                          <Phone className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">{t('bookingDetail.contactConcierge')}</span>
                        </a>
                      )}
                      <a
                        href={`https://wa.me/${booking.phone.startsWith('+') ? booking.phone.substring(1) : booking.phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowContactDrawer(false)}
                        className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Phone className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">{t('booking.contactClient')}</span>
                      </a>
                      <a
                        href="https://wa.me/33769627754"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowContactDrawer(false)}
                        className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <MessageCircle className="w-4 h-4 text-[#25D366]" />
                        <span className="text-sm font-medium">{t('bookingDetail.contactOOM')}</span>
                      </a>
                      
                      <div className="h-px bg-border my-1" />
                      
                      <button
                        onClick={() => {
                          setShowContactDrawer(false);
                          setShowUnassignDialog(true);
                        }}
                        className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-destructive/10 transition-colors w-full"
                      >
                        <X className="w-4 h-4 text-destructive" />
                        <span className="text-sm font-medium text-destructive">{t('bookingDetail.unassignBooking')}</span>
                      </button>
                    </div>
                  </DrawerContent>
                </Drawer>

                {/* Main Action Button - Smart Cashier */}
                {["Assigné", "Confirmé"].includes(booking.status) && !booking.client_signature && (
                  <button
                    onClick={() => setShowPaymentSelection(true)}
                    disabled={updating}
                    className="flex-1 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-full py-2.5 px-4 text-xs font-bold hover:from-primary/90 hover:to-primary/80 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-lg"
                  >
                    <Wallet className="w-4 h-4" />
                    Finaliser ({totalPrice}€)
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation App Selector Drawer */}
      <Drawer open={showNavigationDrawer} onOpenChange={setShowNavigationDrawer}>
        <DrawerContent className="pb-safe">
          <div className="p-4 space-y-1">
            <h3 className="text-sm font-semibold mb-2">{t('bookingDetail.chooseApp')}</h3>
            <button
              onClick={() => openInMaps('apple')}
              className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-muted transition-colors w-full text-left"
            >
              <Navigation className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Apple Maps</span>
            </button>
            <button
              onClick={() => openInMaps('google')}
              className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-muted transition-colors w-full text-left"
            >
              <Navigation className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Google Maps</span>
            </button>
            <button
              onClick={() => openInMaps('waze')}
              className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-muted transition-colors w-full text-left"
            >
              <Navigation className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Waze</span>
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

      {/* Signature Dialog */}
      <InvoiceSignatureDialog
        open={showSignatureDialog}
        onOpenChange={setShowSignatureDialog}
        onConfirm={handleSignatureConfirm}
        loading={signingLoading}
        treatments={treatments.map(t => ({
          name: t.treatment_menus?.name || "Treatment",
          duration: t.treatment_menus?.duration || 0,
          price: t.treatment_menus?.price || 0,
        }))}
        vatRate={booking.hotel_vat || 20}
      />

      {/* Delete Treatment Confirmation Dialog */}
      <AlertDialog open={!!treatmentToDelete} onOpenChange={() => setTreatmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bookingDetail.deleteTreatmentTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('bookingDetail.deleteTreatmentDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => treatmentToDelete && handleDeleteTreatment(treatmentToDelete)}>
              {t('common:buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unassign Booking Confirmation Dialog */}
      <AlertDialog open={showUnassignDialog} onOpenChange={setShowUnassignDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bookingDetail.unassignTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('bookingDetail.unassignDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('bookingDetail.keepBooking')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleUnassignBooking}
              disabled={updating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('bookingDetail.confirmUnassign')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decline Booking Confirmation Dialog */}
      <AlertDialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bookingDetail.declineTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('bookingDetail.declineDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeclineBooking}
              disabled={updating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('bookingDetail.confirmDecline')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Selection Drawer - Smart Cashier */}
      <PaymentSelectionDrawer
        open={showPaymentSelection}
        onOpenChange={setShowPaymentSelection}
        bookingId={booking.id}
        bookingNumber={booking.booking_id}
        totalPrice={totalPrice}
        treatments={treatments.map(t => ({
          name: t.treatment_menus?.name || "Treatment",
          duration: t.treatment_menus?.duration || 0,
          price: t.treatment_menus?.price || 0,
        }))}
        vatRate={booking.hotel_vat || 20}
        onSignatureRequired={handleRoomPaymentSignature}
        onPaymentComplete={handlePaymentComplete}
      />
    </>
  );
};

export default PwaBookingDetail;
