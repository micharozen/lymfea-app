import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useCreateBookingMutation } from "@/hooks/booking/useCreateBookingMutation";
import { BookingData } from "@/components/booking/PaymentLinkForm";
import { BookingProgressBar } from "@/components/pwa/new-booking/BookingProgressBar";
import { ClientInfoStep } from "@/components/pwa/new-booking/ClientInfoStep";
import { TreatmentStep } from "@/components/pwa/new-booking/TreatmentStep";
import { SummaryStep } from "@/components/pwa/new-booking/SummaryStep";
import { SuccessStep } from "@/components/pwa/new-booking/SuccessStep";
import { Loader2, ArrowLeft, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { computeOutOfHoursSurcharge, type SurchargeConfig } from "@/lib/surcharge";
import type { BookingClientType } from "@/lib/clientTypeMeta";

interface Therapist {
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
  /** Prix unitaire forcé (€ absolu). null/undefined = prix catalogue. */
  priceOverride?: number | null;
}

const PwaNewBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("pwa");

  // Steps: 1=Client Info, 2=Treatments, 3=Summary, 4=Payment Link
  const [step, setStep] = useState(1);

  // Therapist data
  const [therapist, setTherapist] = useState<Therapist | null>(null);

  // Hotels
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState("");

  // Config majoration hors horaires du lieu (affichage + persistance)
  const [surchargeConfig, setSurchargeConfig] = useState<SurchargeConfig | null>(null);

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

  // Assignation à un autre thérapeute
  const [assignToOther, setAssignToOther] = useState(false);
  const [venueTherapists, setVenueTherapists] = useState<Therapist[]>([]);
  const [selectedTherapistId, setSelectedTherapistId] = useState("");
  const [venueTherapistsLoading, setVenueTherapistsLoading] = useState(false);

  // Type de client (pilote la logique de paiement dans la mutation)
  const [clientType, setClientType] = useState<BookingClientType>("external");

  // Réservation offerte (gratuite)
  const [isOffert, setIsOffert] = useState(false);

  // Created booking
  const [createdBooking, setCreatedBooking] = useState<any>(null);

  // Loading
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch therapist & hotels on mount + pre-fill date/time from URL params
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
        .from("therapists")
        .select("id, first_name, last_name")
        .eq("user_id", user.id)
        .single();

      if (hd) {
        setTherapist(hd);

        const { data: affiliations } = await supabase
          .from("therapist_venues")
          .select("hotel_id")
          .eq("therapist_id", hd.id);

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

  // Fetch out-of-hours surcharge config when hotel changes
  useEffect(() => {
    if (!selectedHotelId) {
      setSurchargeConfig(null);
      return;
    }
    const fetchSurchargeConfig = async () => {
      const { data } = await supabase
        .from("hotels")
        .select(
          "opening_time, closing_time, allow_out_of_hours_booking, out_of_hours_surcharge_percent"
        )
        .eq("id", selectedHotelId)
        .single();
      setSurchargeConfig(data ?? null);
    };
    fetchSurchargeConfig();
  }, [selectedHotelId]);

  // Fetch venue therapists when "assign to other" is enabled
  useEffect(() => {
    if (!assignToOther || !selectedHotelId) {
      setVenueTherapists([]);
      return;
    }
    const fetchVenueTherapists = async () => {
      setVenueTherapistsLoading(true);
      const { data, error } = await supabase.rpc("get_venue_therapists", {
        _hotel_id: selectedHotelId,
      });
      if (!error && data) {
        // Exclure le thérapeute connecté (réservation par défaut sur lui)
        setVenueTherapists(
          (data as Therapist[]).filter((tp) => tp.id !== therapist?.id)
        );
      }
      setVenueTherapistsLoading(false);
    };
    fetchVenueTherapists();
  }, [assignToOther, selectedHotelId, therapist?.id]);

  // Reset selected therapist when venue changes or assignment is turned off
  useEffect(() => {
    setSelectedTherapistId("");
  }, [selectedHotelId, assignToOther]);

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
  // Prix unitaire forcé (null = retour au prix catalogue).
  const setLineOverride = (treatmentId: string, value: number | null) =>
    setCart((prev) =>
      prev.map((item) =>
        item.treatmentId === treatmentId
          ? { ...item, priceOverride: value }
          : item
      )
    );

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
        (sum, item) =>
          sum + (item.priceOverride ?? item.treatment?.price ?? 0) * item.quantity,
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

  // Majoration hors horaires (affichage — le serveur recalcule et fait foi)
  const surcharge = useMemo(
    () => computeOutOfHoursSurcharge(selectedTime, totalPrice, surchargeConfig),
    [selectedTime, totalPrice, surchargeConfig]
  );

  const treatmentIds = useMemo(
    () =>
      cart.flatMap((item) =>
        Array.from({ length: item.quantity }, () => item.treatmentId)
      ),
    [cart]
  );

  // Lignes de soin avec prix forcé, une entrée par unité (la mutation privilégie
  // `treatments[]` sur `treatmentIds` pour persister les price_override).
  const treatmentPayloads = useMemo(
    () =>
      cart.flatMap((item) =>
        Array.from({ length: item.quantity }, () => ({
          treatmentId: item.treatmentId,
          priceOverride: item.priceOverride ?? null,
        }))
      ),
    [cart]
  );

  // Thérapeute effectivement associé à la réservation
  const effectiveTherapistId =
    assignToOther && selectedTherapistId ? selectedTherapistId : therapist?.id;

  // Liste passée à la mutation pour résoudre le nom du thérapeute assigné
  const therapistsForMutation = useMemo(
    () => [therapist, ...venueTherapists].filter(Boolean) as Therapist[],
    [therapist, venueTherapists]
  );

  // Mutation
  const createBooking = useCreateBookingMutation({
    hotels,
    therapists: therapistsForMutation,
    onSuccess: (data) => {
      setCreatedBooking(data);
      toast.success(
        `${t("newBooking.createdToast", "Réservation créée")}${
          data?.booking_id ? ` #${data.booking_id}` : ""
        }`
      );
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
      if (!selectedDate) {
        toast.error("Veuillez sélectionner une date");
        return;
      }
      if (!selectedTime) {
        toast.error("Veuillez sélectionner une heure");
        return;
      }
      if (assignToOther && !selectedTherapistId) {
        toast.error("Veuillez sélectionner un thérapeute");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!canProceedStep2) {
        toast.error("Veuillez sélectionner au moins un traitement");
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 1) {
      navigate("/pwa/dashboard");
    } else {
      setStep(step - 1);
    }
  };

  const handleCreate = () => {
    if (!therapist || !selectedDate || !effectiveTherapistId) return;

    createBooking.mutate({
      hotelId: selectedHotelId,
      clientFirstName: clientFirstName.trim(),
      clientLastName: clientLastName.trim(),
      clientEmail: email.trim() || undefined,
      phone: phone.trim(),
      countryCode,
      roomNumber,
      date: format(selectedDate, "yyyy-MM-dd"),
      time: selectedTime,
      therapistId: effectiveTherapistId,
      slot2Date: null,
      slot2Time: null,
      slot3Date: null,
      slot3Time: null,
      treatmentIds,
      treatments: treatmentPayloads,
      totalPrice: isOffert ? 0 : totalPrice + surcharge.surchargeAmount,
      totalDuration,
      isAdmin: true,
      isOffert,
      clientType,
      isOutOfHours: isOffert ? false : surcharge.isOutOfHours,
      surchargeAmount: isOffert ? 0 : surcharge.surchargeAmount,
    }, {
      // Le onError du hook passe par le toast shadcn (non monté sur la PWA) :
      // on double avec un toast sonner pour rendre l'échec visible ici.
      onError: (error: Error) => {
        toast.error(
          `${t("newBooking.createError", "Échec de la création")} : ${error.message}`
        );
      },
    });
  };

  const stepTitles: Record<number, string> = {
    1: t("newBooking.clientInfo", "Informations client"),
    2: t("newBooking.treatments", "Prestations"),
    3: t("newBooking.summary", "Récapitulatif"),
    4: t("newBooking.bookingCreatedTitle", "Réservation créée"),
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
        total_price: isOffert ? 0 : totalPrice + surcharge.surchargeAmount,
        hotel_name: selectedHotel?.name,
        currency,
        treatments: cartDetails
          .filter((c) => c.treatment)
          .map((c) => ({
            name: c.treatment!.name,
            price: (c.priceOverride ?? c.treatment!.price) * c.quantity,
          })),
      }
    : null;

  if (initialLoading) {
    return (
      <div className="app-refonte flex items-center justify-center min-h-[100dvh]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  const isConfirm = step === 4;

  return (
    <div className="app-refonte flex flex-col h-full min-h-[100dvh]">
      <div className="sub-hdr" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        {isConfirm ? (
          <span style={{ width: 38 }} />
        ) : (
          <button
            type="button"
            className="back-btn"
            onClick={handleBack}
            aria-label={t("newBooking.back", "Retour")}
          >
            {step === 1 ? <X size={17} /> : <ArrowLeft size={18} />}
          </button>
        )}
        <span className="ttl">{stepTitles[step]}</span>
        {isConfirm ? (
          <button
            type="button"
            className="back-btn"
            onClick={() => navigate("/pwa/dashboard")}
            aria-label={t("common.close", "Fermer")}
          >
            <X size={17} />
          </button>
        ) : (
          <span style={{ width: 38 }} />
        )}
      </div>

      <BookingProgressBar currentStep={step} />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {step === 1 && (
          <ClientInfoStep
              hotels={hotels}
              selectedHotelId={selectedHotelId}
              setSelectedHotelId={setSelectedHotelId}
              clientType={clientType}
              setClientType={setClientType}
              assignToOther={assignToOther}
              setAssignToOther={setAssignToOther}
              venueTherapists={venueTherapists}
              venueTherapistsLoading={venueTherapistsLoading}
              selectedTherapistId={selectedTherapistId}
              setSelectedTherapistId={setSelectedTherapistId}
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
              setLineOverride={setLineOverride}
              onNext={handleNext}
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
              isOutOfHours={surcharge.isOutOfHours}
              surchargeAmount={surcharge.surchargeAmount}
              surchargePercent={surcharge.surchargePercent}
              isOffert={isOffert}
              onIsOffertChange={setIsOffert}
              isPending={createBooking.isPending}
              onCreate={handleCreate}
            />
          )}

          {step === 4 && paymentLinkBooking && (
            <SuccessStep
              booking={paymentLinkBooking}
              bookingId={createdBooking?.booking_id}
              clientFirstName={clientFirstName}
              clientLastName={clientLastName}
              isOffert={isOffert}
              clientType={clientType}
            />
          )}
      </main>
    </div>
  );
};

export default PwaNewBooking;
