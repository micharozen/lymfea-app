import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { useBasket } from './context/BasketContext';
import { useClientFlow } from './context/ClientFlowContext';
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/lib/formatPrice';

export default function ClientCheckout() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { items, total } = useBasket();
  const { setBookingDateTime, setClientInfo } = useClientFlow();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    countryCode: '+33',
    email: '',
    roomNumber: '',
    date: '',
    time: '',
  });

  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const countryCodes = [
    { code: '+33', country: 'France' },
    { code: '+1', country: 'USA/Canada' },
    { code: '+44', country: 'UK' },
    { code: '+49', country: 'Germany' },
    { code: '+34', country: 'Spain' },
    { code: '+39', country: 'Italy' },
  ];

  // Generate date options (next 14 days)
  const dateOptions = useMemo(() => {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < 14; i++) {
      const date = addDays(today, i);
      let label = format(date, 'd MMM');
      
      if (i === 0) label = 'Today';
      else if (i === 1) label = 'Tomorrow';
      
      dates.push({
        value: format(date, 'yyyy-MM-dd'),
        label,
        dayLabel: format(date, 'EEEE'),
        fullLabel: format(date, 'd MMM'),
      });
    }
    
    return dates;
  }, []);

  // Generate time slots (6AM to 11PM every 30 minutes)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 6; hour < 23; hour++) {
      for (let minute of [0, 30]) {
        const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const period = hour >= 12 ? 'PM' : 'AM';
        const time12 = `${hour12}:${minute.toString().padStart(2, '0')}${period}`;
        
        slots.push({
          value: time24,
          label: time12,
        });
      }
    }
    return slots;
  }, []);

  // Fetch available slots when date changes
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!formData.date || !hotelId) return;

      setLoadingAvailability(true);
      try {
        const { data, error } = await supabase.functions.invoke('check-availability', {
          body: { hotelId, date: formData.date }
        });

        if (error) throw error;
        
        setAvailableSlots(data?.availableSlots || []);
        
        // Clear time if it's no longer available
        if (formData.time && !data?.availableSlots.includes(formData.time)) {
          setFormData(prev => ({ ...prev, time: '' }));
        }
      } catch (error) {
        console.error('Error checking availability:', error);
        toast.error('Unable to check availability');
      } finally {
        setLoadingAvailability(false);
      }
    };

    fetchAvailability();
  }, [formData.date, hotelId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.firstName || !formData.lastName || !formData.phone || 
        !formData.email || !formData.roomNumber || !formData.date || !formData.time) {
      toast.error('Please fill in all fields');
      return;
    }

    if (items.length === 0) {
      toast.error('Your basket is empty');
      return;
    }

    // Store form data in context instead of sessionStorage
    setBookingDateTime({
      date: formData.date,
      time: formData.time,
    });

    setClientInfo({
      firstName: formData.firstName,
      lastName: formData.lastName,
      phone: formData.phone,
      countryCode: formData.countryCode,
      email: formData.email,
      roomNumber: formData.roomNumber,
    });

    navigate(`/client/${hotelId}/payment`);
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/basket`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Checkout</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {/* Personal Information */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Personal Information</h2>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                placeholder="John"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="john.doe@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <div className="flex gap-2">
              <Select
                value={formData.countryCode}
                onValueChange={(value) => setFormData(prev => ({ ...prev, countryCode: value }))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countryCodes.map(({ code, country }) => (
                    <SelectItem key={code} value={code}>
                      {code} {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="612345678"
                className="flex-1"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="roomNumber">Room Number</Label>
            <Input
              id="roomNumber"
              value={formData.roomNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, roomNumber: e.target.value }))}
              placeholder="102"
              required
            />
          </div>
        </div>

        {/* Booking Date & Time */}
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-semibold">Date</Label>
            <div className="relative">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
                {dateOptions.map(({ value, label, dayLabel, fullLabel }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, date: value }))}
                    className={`flex-shrink-0 snap-start px-4 py-3 rounded-xl border-2 transition-all ${
                      formData.date === value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-sm font-semibold whitespace-nowrap">
                        {label === 'Today' || label === 'Tomorrow' ? label : dayLabel}
                      </div>
                      {(label === 'Today' || label === 'Tomorrow') && (
                        <div className="text-xs opacity-80 whitespace-nowrap">{fullLabel}</div>
                      )}
                      {label !== 'Today' && label !== 'Tomorrow' && (
                        <div className="text-xs opacity-80 whitespace-nowrap">{fullLabel}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">
              Time
              {loadingAvailability && (
                <span className="ml-2 text-xs text-muted-foreground">(Loading...)</span>
              )}
            </Label>
            {!formData.date ? (
              <p className="text-sm text-muted-foreground">Please select a date first</p>
            ) : (
              <div className="relative">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
                  {timeSlots
                    .filter(({ value }) => availableSlots.includes(value))
                    .map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, time: value }))}
                        disabled={loadingAvailability}
                        className={`flex-shrink-0 snap-start px-6 py-3 rounded-xl border-2 transition-all font-medium ${
                          formData.time === value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-border hover:border-primary/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Summary */}
        <div className="space-y-4 pt-4 border-t border-border">
          <h2 className="text-lg font-semibold">Order Summary</h2>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.name} x{item.quantity}
                </span>
                <span className="font-medium">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-lg font-semibold pt-2 border-t border-border">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
      </form>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button
          onClick={handleSubmit}
          className="w-full h-14 text-lg"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
