import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useCreateBookingMutation } from "@/hooks/booking/useCreateBookingMutation";
import { BookingData } from "@/components/booking/PaymentLinkForm";
import PwaHeader from "@/components/pwa/Header";
import { BookingProgressBar } from "@/components/pwa/new-booking/BookingProgressBar";
import { StepTransition } from "@/components/pwa/new-booking/StepTransition";
import { ClientInfoStep } from "@/components/pwa/new-booking/ClientInfoStep";
import { TreatmentStep } from "@/components/pwa/new-booking/TreatmentStep";
import { SummaryStep } from "@/components/pwa/new-booking/SummaryStep";
import { SuccessStep } from "@/components/pwa/new-booking/SuccessStep";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Hairdresser {
  id: string;
  first_name: string;
  last_name: string;
}

interface Hotel {
  id: string;
  name: string;
  timezone?: string | null;
  currency?: string | null;
}

interface Treatment {
  id: string;
  name: string;
  description?: string;
  duration: number;
  price: number;
  price_on_request?: boolean;
  service_for?: string;
  category?: string;
  currency?: string;
}

interface CartItem {
  treatmentId: string;
  quantity: number;
}

const PwaNewBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("pwa");

  // Steps: 1=Client Info, 2=Treatments, 3=Summary, 4=Payment Link
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");

  // Hairdresser data
  const [hairdresser, setHairdresser] = useState<Hairdresser | null>(null);

  // Hotels
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState("");

  // Client info
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+33");
  const [email, setEmail] = useState("");
  const [roomNumber, setRoomNumber] = useState("");

  // Date/Time
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [hourOpen, setHourOpen] = useState(false);
  const [minuteOpen, setMinuteOpen] = useState(false);

  // Treatments
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [treatmentsLoading, setTreatmentsLoading] = useState(false);

  // Created booking
  const [createdBooking, setCreatedBooking] = useState<any>(null);

  // Loading
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch hairdresser & hotels on mount + pre-fill date/time from URL params
  useEffect(() => {
    // Pre-fill date/time from calendar slot click (?date=...&time=...)
    const params = new URLSearchParams(location.search);
    const dateParam = params.get('date');
    const timeParam = params.get('time');
    if (dateParam) setSelectedDate(new Date(dateParam + "T00:00:00"));
    if (timeParam) setSelectedTime(timeParam);

    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: hd } = await supabase
        .from("hairdressers")
        .select("id, first_name, last_name")
        .eq("user_id", user.id)
        .single();

      if (hd) {
        setHairdresser(hd);

        const { data: affiliations } = await supabase
          .from("hairdresser_hotels")
          .select("hotel_id")
          .eq("hairdresser_id", hd.id);

        if (affiliations && affiliations.length > 0) {
          const hotelIds = affiliations.map((a) => a.hotel_id);

          const hotelResults = await Promise.all(
            hotelIds.map((id) =>
              supabase.rpc("get_public_hotel_by_id", { _hotel_id: id })
            )
          );

          const hotelList = hotelResults
            .map((r) => r.data?.[0])
            .filter(Boolean) as Hotel[];

          if (hotelList.length > 0) {
            setHotels(hotelList);
            if (hotelList.length === 1) {
              setSelectedHotelId(hotelList[0].id);
            }
          }
        }
      }
      setInitialLoading(false);
    };
    fetchData();
  }, []);

  // Fetch treatments when hotel changes
  useEffect(() => {
    if (!selectedHotelId) {
      setTreatments([]);
      return;
    }
    const fetchTreatments = async () => {
      setTreatmentsLoading(true);
      const { data, error } = await supabase.rpc("get_public_treatments", {
        _hotel_id: selectedHotelId,
      });
      console.log("[NewBooking] treatments for hotel", selectedHotelId, ":", data, "error:", error);
      if (!error && data) {
        setTreatments(data as Treatment[]);
      }
      setTreatmentsLoading(false);
    };
    fetchTreatments();
  }, [selectedHotelId]);

  const selectedHotel = hotels.find((h) => h.id === selectedHotelId);
  const currency = selectedHotel?.currency || "EUR";

  // Cart helpers
  const addToCart = (treatmentId: string) => {
    setCart((prev) => [...prev, { treatmentId, quantity: 1 }]);
  };
  const incrementCart = (treatmentId: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.treatmentId === treatmentId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };
  const decrementCart = (treatmentId: string) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.treatmentId === treatmentId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };
  const getCartQuantity = (treatmentId: string) =>
    cart.find((c) => c.treatmentId === treatmentId)?.quantity || 0;

  const cartDetails = useMemo(
    () =>
      cart.map((item) => ({
        ...item,
        treatment: treatments.find((t) => t.id === item.treatmentId),
      })),
    [cart, treatments]
  );

  const totalPrice = useMemo(
    () =>
      cartDetails.reduce(
        (sum, item) => sum + (item.treatment?.price || 0) * item.quantity,
        0
      ),
    [cartDetails]
  );

  const totalDuration = useMemo(
    () =>
      cartDetails.reduce(
        (sum, item) => sum + (item.treatment?.duration || 0) * item.quantity,
        0
      ),
    [cartDetails]
  );

  const treatmentIds = useMemo(
    () =>
      cart.flatMap((item) =>
        Array.from({ length: item.quantity }, () => item.treatmentId)
      ),
    [cart]
  );

  // Mutation
  const createBooking = useCreateBookingMutation({
    hotels,
    hairdressers: hairdresser ? [hairdresser] : [],
    onSuccess: (data) => {
      setCreatedBooking(data);
      setDirection("forward");
      setStep(4);
    },
  });

  // Validation
  const canProceedStep2 = cart.length > 0;

  const handleNext = () => {
    if (step === 1) {
      if (!selectedHotelId) {
        toast.error("Veuillez sélectionner un lieu");
        return;
      }
      if (!clientFirstName.trim() || !clientLastName.trim()) {
        toast.error("Veuillez renseigner le prénom et le nom du client");
        return;
      }
      if (!phone.trim()) {
        toast.error("Veuillez renseigner le numéro de téléphone");
        return;
      }
      if (!selectedDate) {
        toast.error("Veuillez sélectionner une date");
        return;
      }
      if (!selectedTime) {
        toast.error("Veuillez sélectionner une heure");
        return;
      }
      setDirection("forward");
      setStep(2);
    } else if (step === 2) {
      if (!canProceedStep2) {
        toast.error("Veuillez sélectionner au moins un traitement");
        return;
      }
      setDirection("forward");
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 1) {
      navigate("/pwa/dashboard");
    } else {
      setDirection("backward");
      setStep(step - 1);
    }
  };

  const handleCreate = () => {
    if (!hairdresser || !selectedDate) return;

    createBooking.mutate({
      hotelId: selectedHotelId,
      clientFirstName: clientFirstName.trim(),
      clientLastName: clientLastName.trim(),
      phone: phone.trim(),
      countryCode,
      roomNumber,
      date: format(selectedDate, "yyyy-MM-dd"),
      time: selectedTime,
      hairdresserId: hairdresser.id,
      slot2Date: null,
      slot2Time: null,
      slot3Date: null,
      slot3Time: null,
      treatmentIds,
      totalPrice,
      totalDuration,
      isAdmin: true,
    });
  };

  const stepTitles: Record<number, string> = {
    1: t("newBooking.clientInfo", "Informations client"),
    2: t("newBooking.treatments", "Prestations"),
    3: t("newBooking.summary", "Récapitulatif"),
    4: t("newBooking.payment", "Lien de paiement"),
  };

  // Payment link booking data
  const paymentLinkBooking: BookingData | null = createdBooking
    ? {
        id: createdBooking.id,
        booking_id: createdBooking.booking_id,
        client_first_name: clientFirstName,
        client_last_name: clientLastName,
        client_email: email,
        phone: `${countryCode} ${phone}`,
        room_number: roomNumber,
        booking_date: format(selectedDate!, "yyyy-MM-dd"),
        booking_time: selectedTime,
        total_price: totalPrice,
        hotel_name: selectedHotel?.name,
        currency,
        treatments: cartDetails
          .filter((c) => c.treatment)
          .map((c) => ({
            name: c.treatment!.name,
            price: c.treatment!.price * c.quantity,
          })),
      }
    : null;

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh]">
        <Loader2 className="h-8 w-8 animate-spin text-gold-400" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <PwaHeader
        title={stepTitles[step]}
        showBack={step < 4}
        onBack={handleBack}
      />

      <BookingProgressBar currentStep={step} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <StepTransition step={step} direction={direction}>
          {step === 1 && (
            <ClientInfoStep
              hotels={hotels}
              selectedHotelId={selectedHotelId}
              setSelectedHotelId={setSelectedHotelId}
              clientFirstName={clientFirstName}
              setClientFirstName={setClientFirstName}
              clientLastName={clientLastName}
              setClientLastName={setClientLastName}
              phone={phone}
              setPhone={setPhone}
              countryCode={countryCode}
              setCountryCode={setCountryCode}
              email={email}
              setEmail={setEmail}
              roomNumber={roomNumber}
              setRoomNumber={setRoomNumber}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              selectedTime={selectedTime}
              setSelectedTime={setSelectedTime}
              calendarOpen={calendarOpen}
              setCalendarOpen={setCalendarOpen}
              hourOpen={hourOpen}
              setHourOpen={setHourOpen}
              minuteOpen={minuteOpen}
              setMinuteOpen={setMinuteOpen}
              onNext={handleNext}
            />
          )}

          {step === 2 && (
            <TreatmentStep
              treatments={treatments}
              treatmentsLoading={treatmentsLoading}
              cart={cart}
              cartDetails={cartDetails}
              currency={currency}
              totalPrice={totalPrice}
              addToCart={addToCart}
              incrementCart={incrementCart}
              decrementCart={decrementCart}
              getCartQuantity={getCartQuantity}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {step === 3 && selectedDate && (
            <SummaryStep
              hotelName={selectedHotel?.name || ""}
              clientFirstName={clientFirstName}
              clientLastName={clientLastName}
              phone={phone}
              countryCode={countryCode}
              email={email}
              roomNumber={roomNumber}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              cartDetails={cartDetails}
              totalPrice={totalPrice}
              totalDuration={totalDuration}
              currency={currency}
              isPending={createBooking.isPending}
              onCreate={handleCreate}
              onBack={handleBack}
            />
          )}

          {step === 4 && paymentLinkBooking && (
            <SuccessStep
              booking={paymentLinkBooking}
              bookingId={createdBooking?.booking_id}
              clientFirstName={clientFirstName}
              clientLastName={clientLastName}
            />
          )}
        </StepTransition>
      </main>
    </div>
  );
};

export default PwaNewBooking;
