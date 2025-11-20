import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { X, Clock, MapPin, CreditCard, MoreVertical, Plus, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { format, isToday, isTomorrow, isYesterday } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { AddTreatmentDialog } from "./AddTreatmentDialog";

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
  const [booking, setBooking] = useState<Booking | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showAddTreatmentDialog, setShowAddTreatmentDialog] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [conciergeContact, setConciergeContact] = useState<ConciergeContact | null>(null);
  const [adminContact, setAdminContact] = useState<AdminContact | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const navigate = useNavigate();

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

      // Fetch hotel data separately
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

      // Fetch concierge contact for this hotel
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

      // Fetch admin contact (first active admin)
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

  const handleAcceptBooking = async () => {
    if (!booking) return;
    
    setUpdating(true);
    try {
      // Get current hairdresser ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: hairdresserData } = await supabase
        .from("hairdressers")
        .select("id, first_name, last_name")
        .eq("user_id", user.id)
        .single();

      if (!hairdresserData) throw new Error("Hairdresser not found");

      // Check if booking is still available (no hairdresser assigned)
      const { data: currentBooking } = await supabase
        .from("bookings")
        .select("hairdresser_id, hairdresser_name, hotel_id")
        .eq("id", booking.id)
        .single();

      if (currentBooking?.hairdresser_id) {
        toast.error(`Cette réservation a déjà été acceptée par ${currentBooking.hairdresser_name}`);
        setShowConfirmDialog(false);
        setUpdating(false);
        navigate("/pwa/dashboard");
        return;
      }

      // Calculate total price from treatments
      const totalPrice = treatments.reduce((sum, t) => sum + (t.treatment_menus?.price || 0), 0);

      // Assign booking to current hairdresser and update total_price
      const hairdresserName = `${hairdresserData.first_name || ''} ${hairdresserData.last_name || ''}`.trim();
      const { error: updateError } = await supabase
        .from("bookings")
        .update({ 
          status: "Confirmé",
          hairdresser_id: hairdresserData.id,
          hairdresser_name: hairdresserName,
          assigned_at: new Date().toISOString(),
          total_price: totalPrice
        })
        .eq("id", booking.id)
        .is("hairdresser_id", null); // Only update if still unassigned

      if (updateError) throw updateError;

      // Get other hairdressers from the same hotel to notify them
      const { data: otherHairdressers } = await supabase
        .from("hairdresser_hotels")
        .select(`
          hairdresser_id,
          hairdressers!inner(user_id, first_name, last_name)
        `)
        .eq("hotel_id", currentBooking.hotel_id)
        .neq("hairdresser_id", hairdresserData.id);

      // Create notifications for other hairdressers
      if (otherHairdressers && otherHairdressers.length > 0) {
        const notifications = otherHairdressers.map((hd: any) => ({
          user_id: hd.hairdressers.user_id,
          booking_id: booking.id,
          type: "booking_taken",
          message: `La réservation #${booking.booking_id} a été acceptée par ${hairdresserName}`
        }));

        await supabase.from("notifications").insert(notifications);
      }

      // Show success animation
      setShowSuccessAnimation(true);
      toast.success("Réservation acceptée");
      
      // Navigate after animation
      setTimeout(() => {
        navigate("/pwa/dashboard");
      }, 1500);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur lors de l'acceptation");
    } finally {
      setUpdating(false);
      setShowConfirmDialog(false);
    }
  };

  const handleRejectBooking = async () => {
    if (!booking) return;
    
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ 
          status: "Refusé",
          cancellation_reason: rejectReason || "Refusé par le coiffeur"
        })
        .eq("id", booking.id);

      if (error) throw error;

      toast.success("Réservation refusée");
      navigate("/pwa/dashboard");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur");
    } finally {
      setUpdating(false);
      setShowRejectDialog(false);
      setRejectReason("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-sm text-gray-500">Booking not found</div>
      </div>
    );
  }

  const getRelativeDay = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    if (isYesterday(date)) return "Yesterday";
    return "";
  };

  const relativeDay = getRelativeDay(booking.booking_date);
  
  // Calculate total price from treatments (same logic as dashboard)
  const totalPrice = treatments.length > 0 
    ? treatments.reduce((sum, t) => sum + (t.treatment_menus?.price || 0), 0)
    : booking.total_price || 0;


  return (
    <>
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="bg-white px-6 py-4 flex items-center justify-between border-b border-gray-200">
          <button onClick={() => navigate("/pwa/dashboard")}>
            <X className="w-6 h-6 text-black" />
          </button>
          <h1 className="text-base font-semibold">
            {booking.status === "En attente" ? "Booking request" : "Booking details"}
          </h1>
          <div className="w-6" />
        </div>

        {/* Hotel Info */}
        <div className="px-6 py-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-16 self-stretch bg-gray-100 rounded flex-shrink-0 overflow-hidden min-h-[72px]">
              {booking.hotel_image_url ? (
                <img 
                  src={booking.hotel_image_url} 
                  alt={booking.hotel_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 rounded" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-base mb-1">{booking.hotel_name}</h2>
              <p className="text-sm text-gray-500">
                {format(new Date(booking.booking_date), "EEE d MMM")}, {booking.booking_time.substring(0, 5)} • {treatments.reduce((sum, t) => sum + (t.treatment_menus?.duration || 0), 0)} min
              </p>
              {booking.room_number && booking.status === "En attente" && (
                <p className="text-sm text-gray-500">Room: {booking.room_number}</p>
              )}
            </div>
          </div>

          {/* Booking Details */}
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-semibold">Booking details</h3>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{booking.hotel_name}</p>
                  {booking.hotel_city && (
                    <p className="text-xs text-gray-400">{booking.hotel_city}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">
                    {format(new Date(booking.booking_date), "EEE d MMM")}, {booking.booking_time.substring(0, 5)}
                  </p>
                  {relativeDay && (
                    <p className="text-xs text-gray-400">{relativeDay}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">€{totalPrice}</p>
                  <p className="text-xs text-gray-400">Payout</p>
                </div>
              </div>
            </div>
          </div>

          {/* Treatments */}
          {treatments.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Treatments</h3>
              <div className="space-y-3">
                {treatments.map((treatment) => (
                  <div key={treatment.id} className="flex items-start gap-3">
                    <Avatar className="w-10 h-10 flex-shrink-0">
                      {treatment.treatment_menus?.image ? (
                        <AvatarImage src={treatment.treatment_menus.image} alt={treatment.treatment_menus.name} />
                      ) : null}
                      <AvatarFallback className="bg-gray-200 text-xs">
                        {treatment.treatment_menus?.name?.[0] || 'T'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{treatment.treatment_menus?.name || 'Treatment'}</p>
                      {treatment.treatment_menus?.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{treatment.treatment_menus.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        €{treatment.treatment_menus?.price || 0} • {treatment.treatment_menus?.duration || 0} min
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Treatment Button */}
          {(booking.status === "Assigné") && (
            <div className="pt-4">
              <button
                onClick={() => setShowAddTreatmentDialog(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Ajouter une prestation
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {booking.status === "En attente" && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRejectDialog(true)}
                className="w-12 h-12 rounded-full border-2 border-gray-200 flex items-center justify-center hover:bg-gray-50"
              >
                <X className="w-5 h-5 text-red-500" />
              </button>
              <button
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                className="w-12 h-12 rounded-full border-2 border-gray-200 flex items-center justify-center hover:bg-gray-50"
              >
                <MoreVertical className="w-5 h-5 text-black" />
              </button>
              <button
                onClick={() => setShowConfirmDialog(true)}
                disabled={updating}
                className="flex-1 bg-black text-white rounded-full py-3 px-6 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="text-lg">✓</span>
                Accept
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actions Menu */}
      {showActionsMenu && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50" onClick={() => setShowActionsMenu(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-sm p-6 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6" />
            <h3 className="text-lg font-semibold mb-4">Actions</h3>
            
            <div className="space-y-2">
              <a
                href={`tel:${booking.phone}`}
                className="flex items-center gap-3 p-4 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setShowActionsMenu(false)}
              >
                <Phone className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium">Contacter le client</p>
                  <p className="text-sm text-gray-500">{booking.phone}</p>
                </div>
              </a>
              
              {conciergeContact && (
                <a
                  href={`tel:${conciergeContact.country_code}${conciergeContact.phone}`}
                  className="flex items-center gap-3 p-4 hover:bg-gray-50 rounded-lg transition-colors"
                  onClick={() => setShowActionsMenu(false)}
                >
                  <Phone className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium">Contacter le concierge</p>
                    <p className="text-sm text-gray-500">
                      {conciergeContact.first_name} {conciergeContact.last_name} • {conciergeContact.country_code}{conciergeContact.phone}
                    </p>
                  </div>
                </a>
              )}

              {adminContact && (
                <a
                  href={`tel:${adminContact.country_code}${adminContact.phone}`}
                  className="flex items-center gap-3 p-4 hover:bg-gray-50 rounded-lg transition-colors"
                  onClick={() => setShowActionsMenu(false)}
                >
                  <Phone className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium">Contacter OOM</p>
                    <p className="text-sm text-gray-500">
                      {adminContact.first_name} {adminContact.last_name} • {adminContact.country_code}{adminContact.phone}
                    </p>
                  </div>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-3">Please confirm again</h3>
            <p className="text-sm text-gray-600 mb-6">
              You are about to accept this booking order. We will send you a confirmation reminder 1 hour before the booking start time.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 border border-gray-300 rounded-full py-2.5 px-4 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAcceptBooking}
                disabled={updating}
                className="flex-1 bg-black text-white rounded-full py-2.5 px-4 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {updating ? "..." : "Yes, confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-3">Are you sure you want to decline this booking?</h3>
            <p className="text-sm text-gray-600 mb-4">
              If you decline this order, you will no longer deliver your services for this appointment.
            </p>
            <div className="mb-6">
              <label className="text-xs text-gray-500 mb-2 block">Reason for Decline (Optional)</label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Optional"
                className="w-full min-h-[80px] text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="flex-1 border border-gray-300 rounded-full py-2.5 px-4 text-sm font-medium hover:bg-gray-50"
              >
                No
              </button>
              <button
                onClick={handleRejectBooking}
                disabled={updating}
                className="flex-1 bg-red-500 text-white rounded-full py-2.5 px-4 text-sm font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {updating ? "..." : "Yes, decline"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Treatment Dialog */}
      {booking && (
        <AddTreatmentDialog
          open={showAddTreatmentDialog}
          onOpenChange={setShowAddTreatmentDialog}
          bookingId={booking.id}
          hotelId={booking.hotel_id}
          onTreatmentsAdded={fetchBookingDetail}
        />
      )}

      {/* Success Animation */}
      {showSuccessAnimation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 flex flex-col items-center animate-scale-in">
            <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-4">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Réservation acceptée !</h3>
            <p className="text-gray-500 text-sm">Redirection...</p>
          </div>
        </div>
      )}
    </>
  );
};

export default PwaBookingDetail;
