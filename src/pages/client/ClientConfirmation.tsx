import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Calendar, Clock, MapPin, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { useEffect } from 'react';

export default function ClientConfirmation() {
  const { hotelId, bookingId } = useParams<{ hotelId: string; bookingId: string }>();
  const navigate = useNavigate();

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          booking_treatments (
            treatment_id,
            treatment_menus (
              name,
              price
            )
          )
        `)
        .eq('id', bookingId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });

  useEffect(() => {
    // Animate checkmark on mount
    const timer = setTimeout(() => {
      const checkmark = document.getElementById('success-checkmark');
      if (checkmark) {
        checkmark.classList.add('animate-fade-in');
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Booking not found</h1>
          <Button onClick={() => navigate(`/client/${hotelId}`)}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Success Animation */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div 
          id="success-checkmark"
          className="mb-6 opacity-0"
        >
          <CheckCircle2 className="h-24 w-24 text-success" strokeWidth={2} />
        </div>
        
        <h1 className="text-3xl font-bold mb-3 animate-fade-in">
          Your booking is completed!
        </h1>
        
        <p className="text-muted-foreground mb-8 animate-fade-in max-w-md">
          A confirmation SMS will be sent to your phone. 
          A hairdresser will be assigned to your booking shortly.
        </p>

        {/* Booking Details */}
        <div className="w-full max-w-md bg-card rounded-lg p-6 space-y-4 animate-fade-in border border-border">
          <div className="pb-4 border-b border-border">
            <p className="text-sm text-muted-foreground mb-1">Booking Number</p>
            <p className="text-2xl font-bold">#{booking.booking_id}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-medium">{booking.hotel_name}</p>
                <p className="text-sm text-muted-foreground">Room {booking.room_number}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-medium">
                  {format(new Date(booking.booking_date), 'EEEE, MMMM d, yyyy')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Time</p>
                <p className="font-medium">{booking.booking_time}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Contact</p>
                <p className="font-medium">{booking.phone}</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-2">Total Amount</p>
            <p className="text-2xl font-bold">€{Number(booking.total_price).toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {booking.payment_method === 'room' 
                ? 'Will be added to your room bill' 
                : 'Paid by card'}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Button */}
      <div className="p-4 border-t border-border">
        <Button
          onClick={() => navigate(`/client/${hotelId}`)}
          variant="outline"
          className="w-full h-14 text-lg"
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
}
