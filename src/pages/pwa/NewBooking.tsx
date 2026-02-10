import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useCreateBookingMutation } from "@/hooks/booking/useCreateBookingMutation";
import { PaymentLinkForm, BookingData } from "@/components/booking/PaymentLinkForm";
import PwaHeader from "@/components/pwa/Header";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { countries, formatPhoneNumber } from "@/lib/phone";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarIcon,
  ChevronDown,
  Plus,
  Minus,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
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
  const { t } = useTranslation("pwa");

  // Steps: 1=Client Info, 2=Treatments, 3=Summary, 4=Payment Link
  const [step, setStep] = useState(1);

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
  const [treatmentFilter, setTreatmentFilter] = useState<"female" | "male">("female");
  const [treatmentsLoading, setTreatmentsLoading] = useState(false);

  // Created booking
  const [createdBooking, setCreatedBooking] = useState<any>(null);

  // Loading
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch hairdresser & hotels on mount
  useEffect(() => {
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

        // Fetch hotel_ids first, then hotel details (avoids RLS join issues)
        const { data: affiliations } = await supabase
          .from("hairdresser_hotels")
          .select("hotel_id")
          .eq("hairdresser_id", hd.id);

        if (affiliations && affiliations.length > 0) {
          const hotelIds = affiliations.map((a) => a.hotel_id);
          const { data: hotelData } = await supabase
            .from("hotels")
            .select("id, name, timezone, currency")
            .in("id", hotelIds);

          if (hotelData) {
            setHotels(hotelData as Hotel[]);
            if (hotelData.length === 1) {
              setSelectedHotelId(hotelData[0].id);
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

  // Expand cart into flat treatmentIds array (1 per quantity)
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
      setStep(4);
    },
  });

  // Validation
  const canProceedStep1 =
    selectedHotelId &&
    clientFirstName.trim() &&
    clientLastName.trim() &&
    phone.trim() &&
    selectedDate &&
    selectedTime;

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
      isAdmin: true, // Confirmed immediately, assigned to self
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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Grouped treatments for step 2
  const filteredTreatments = treatments.filter((t) =>
    treatmentFilter === "female"
      ? t.service_for === "Female" || t.service_for === "All"
      : t.service_for === "Male" || t.service_for === "All"
  );

  const groupedTreatments: Record<string, Treatment[]> = {};
  filteredTreatments.forEach((t) => {
    const c = t.category || "Autres";
    if (!groupedTreatments[c]) groupedTreatments[c] = [];
    groupedTreatments[c].push(t);
  });

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <PwaHeader
        title={stepTitles[step]}
        showBack={step < 4}
        onBack={handleBack}
        rightSlot={
          step < 4 ? (
            <span className="text-xs text-muted-foreground">
              {step}/3
            </span>
          ) : undefined
        }
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Step 1: Client Info + Date/Time */}
        {step === 1 && (
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Hotel selection */}
              {hotels.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {t("newBooking.selectHotel", "Lieu")} *
                  </Label>
                  <Select value={selectedHotelId} onValueChange={setSelectedHotelId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("newBooking.selectHotel", "Sélectionner un lieu")} />
                    </SelectTrigger>
                    <SelectContent>
                      {hotels.map((hotel) => (
                        <SelectItem key={hotel.id} value={hotel.id}>
                          {hotel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Client name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {t("newBooking.firstName", "Prénom")} *
                  </Label>
                  <Input
                    value={clientFirstName}
                    onChange={(e) => setClientFirstName(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {t("newBooking.lastName", "Nom")} *
                  </Label>
                  <Input
                    value={clientLastName}
                    onChange={(e) => setClientLastName(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {t("newBooking.phone", "Téléphone")} *
                </Label>
                <PhoneNumberField
                  value={phone}
                  onChange={(val) => {
                    const formatted = formatPhoneNumber(val, countryCode);
                    setPhone(formatted);
                  }}
                  countryCode={countryCode}
                  setCountryCode={setCountryCode}
                  countries={countries}
                />
              </div>

              {/* Email + Room */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9"
                    placeholder="client@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {t("newBooking.room", "Chambre")}
                  </Label>
                  <Input
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="h-9"
                    placeholder="1002"
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Date *</Label>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full h-9 justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate
                          ? format(selectedDate, "dd/MM/yyyy", { locale: fr })
                          : "Sélectionner"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(d) => {
                          setSelectedDate(d);
                          setCalendarOpen(false);
                        }}
                        disabled={(d) =>
                          d < new Date(new Date().setHours(0, 0, 0, 0))
                        }
                        initialFocus
                        className="pointer-events-auto"
                        locale={fr}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {t("newBooking.time", "Heure")} *
                  </Label>
                  <div className="flex gap-1 items-center">
                    <Popover open={hourOpen} onOpenChange={setHourOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 w-[72px] justify-between font-normal"
                        >
                          {selectedTime.split(":")[0] || "HH"}
                          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[68px] p-0 pointer-events-auto"
                        align="start"
                        onWheelCapture={(e) => e.stopPropagation()}
                        onTouchMoveCapture={(e) => e.stopPropagation()}
                      >
                        <ScrollArea className="h-40 touch-pan-y">
                          <div>
                            {Array.from({ length: 17 }, (_, i) =>
                              String(i + 7).padStart(2, "0")
                            ).map((h) => (
                              <button
                                key={h}
                                type="button"
                                onClick={() => {
                                  setSelectedTime(
                                    `${h}:${selectedTime.split(":")[1] || "00"}`
                                  );
                                  setHourOpen(false);
                                }}
                                className={cn(
                                  "w-full px-3 py-1.5 text-sm text-center",
                                  selectedTime.split(":")[0] === h && "bg-muted"
                                )}
                              >
                                {h}
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                    <span className="text-muted-foreground">:</span>
                    <Popover open={minuteOpen} onOpenChange={setMinuteOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 w-[72px] justify-between font-normal"
                        >
                          {selectedTime.split(":")[1] || "MM"}
                          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[68px] p-0 pointer-events-auto"
                        align="start"
                        onWheelCapture={(e) => e.stopPropagation()}
                        onTouchMoveCapture={(e) => e.stopPropagation()}
                      >
                        <ScrollArea className="h-40 touch-pan-y">
                          <div>
                            {["00", "10", "20", "30", "40", "50"].map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => {
                                  setSelectedTime(
                                    `${selectedTime.split(":")[0] || "09"}:${m}`
                                  );
                                  setMinuteOpen(false);
                                }}
                                className={cn(
                                  "w-full px-3 py-1.5 text-sm text-center",
                                  selectedTime.split(":")[1] === m && "bg-muted"
                                )}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t shrink-0">
              <Button
                className="w-full"
                onClick={handleNext}
              >
                {t("newBooking.next", "Suivant")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Treatments */}
        {step === 2 && (
          <div className="flex-1 flex flex-col px-4 py-4">
            {/* Menu Tabs */}
            <div className="flex items-center gap-4 border-b border-border/50 shrink-0 mb-3">
              {(["female", "male"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTreatmentFilter(f)}
                  className={cn(
                    "pb-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors",
                    treatmentFilter === f
                      ? "text-foreground border-b-2 border-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "female" ? "WOMEN'S MENU" : "MEN'S MENU"}
                </button>
              ))}
            </div>

            {/* Treatment list */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {treatmentsLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Chargement...
                </div>
              ) : !filteredTreatments.length ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Aucune prestation disponible
                </div>
              ) : (
                Object.entries(groupedTreatments).map(([category, items]) => (
                  <div key={category} className="mb-2">
                    <h3 className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 pb-0.5 border-b border-border/30">
                      {category}
                    </h3>
                    <div>
                      {items.map((treatment) => {
                        const qty = getCartQuantity(treatment.id);
                        return (
                          <div
                            key={treatment.id}
                            className="flex items-center justify-between py-1.5 border-b border-border/10 last:border-0"
                          >
                            <div className="flex flex-col flex-1 pr-2 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-foreground text-xs truncate">
                                  {treatment.name}
                                </span>
                                {treatment.price_on_request && (
                                  <span className="shrink-0 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                                    Sur demande
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {treatment.price_on_request
                                  ? `${treatment.duration} min`
                                  : `${formatPrice(treatment.price, currency, { decimals: 0 })} · ${treatment.duration} min`}
                              </span>
                            </div>

                            {qty > 0 ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => decrementCart(treatment.id)}
                                  className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors"
                                >
                                  <Minus className="h-2.5 w-2.5" />
                                </button>
                                <span className="text-xs font-bold w-4 text-center">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => incrementCart(treatment.id)}
                                  className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors"
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => addToCart(treatment.id)}
                                className="shrink-0 bg-foreground text-background text-[9px] font-medium uppercase tracking-wide h-5 px-2.5 rounded-full hover:bg-foreground/80 transition-colors"
                              >
                                Ajouter
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border pt-3 mt-3">
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBack}
                  className="h-8 text-xs px-3 shrink-0"
                >
                  {t("newBooking.back", "Retour")}
                </Button>

                <div className="flex-1 min-w-0 flex justify-center">
                  {cart.length > 0 ? (
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      {cartDetails.slice(0, 2).map(({ treatmentId, quantity, treatment }) => (
                        <div
                          key={treatmentId}
                          className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 shrink-0"
                        >
                          <span className="text-[9px] font-medium truncate max-w-[60px]">
                            {treatment?.name}
                          </span>
                          <span className="text-[9px] font-bold">x{quantity}</span>
                        </div>
                      ))}
                      {cartDetails.length > 2 && (
                        <span className="text-[9px] text-muted-foreground shrink-0">
                          +{cartDetails.length - 2}
                        </span>
                      )}
                      <span className="font-bold text-sm shrink-0 ml-1">
                        {formatPrice(totalPrice, currency)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      Aucun service
                    </span>
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={handleNext}
                  className="h-8 text-xs px-3 shrink-0"
                >
                  {t("newBooking.next", "Suivant")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Summary */}
        {step === 3 && (
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Hotel */}
              <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Lieu</p>
                <p className="text-sm font-medium">{selectedHotel?.name}</p>
              </div>

              {/* Client */}
              <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Client</p>
                <p className="text-sm font-medium">
                  {clientFirstName} {clientLastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {countryCode} {phone}
                  {email && ` · ${email}`}
                  {roomNumber && ` · Chambre ${roomNumber}`}
                </p>
              </div>

              {/* Date/Time */}
              <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">
                  Date & heure
                </p>
                <p className="text-sm font-medium">
                  {selectedDate &&
                    format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}{" "}
                  à {selectedTime}
                </p>
              </div>

              {/* Treatments */}
              <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">
                  Prestations
                </p>
                <div className="space-y-1.5">
                  {cartDetails.map(({ treatmentId, quantity, treatment }) => (
                    <div
                      key={treatmentId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>
                        {treatment?.name}{" "}
                        {quantity > 1 && (
                          <span className="text-muted-foreground">
                            x{quantity}
                          </span>
                        )}
                      </span>
                      <span className="font-medium">
                        {formatPrice(
                          (treatment?.price || 0) * quantity,
                          currency
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/50 mt-2 pt-2 flex justify-between">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-sm font-semibold">
                    {formatPrice(totalPrice, currency)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Durée estimée : {totalDuration} min
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t shrink-0 space-y-2">
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={createBooking.isPending}
              >
                {createBooking.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Création...
                  </>
                ) : (
                  t("newBooking.create", "Créer la réservation")
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleBack}
                disabled={createBooking.isPending}
              >
                {t("newBooking.back", "Retour")}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Payment Link */}
        {step === 4 && paymentLinkBooking && (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col items-center gap-3 mb-6">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <h3 className="text-lg font-semibold">
                {t("newBooking.bookingCreated", "Réservation créée !")}
              </h3>
              <p className="text-sm text-muted-foreground text-center">
                Réservation #{createdBooking?.booking_id} pour {clientFirstName}{" "}
                {clientLastName}
              </p>
            </div>

            <PaymentLinkForm
              booking={paymentLinkBooking}
              onSuccess={() => navigate("/pwa/dashboard")}
              onSkip={() => navigate("/pwa/dashboard")}
              showSkipButton
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default PwaNewBooking;
