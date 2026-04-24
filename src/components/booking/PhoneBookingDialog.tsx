import { useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  ArrowRight,
  CalendarIcon,
  Check,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Search,
  Send,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useBookingCart } from "@/hooks/booking/useBookingCart";
import { useSlotAvailability } from "@/hooks/booking/useSlotAvailability";
import {
  useAvailableTherapistsForSlot,
  type AvailableTherapist,
} from "@/hooks/booking/useAvailableTherapistsForSlot";
import { useCreateBookingMutation } from "@/hooks/booking/useCreateBookingMutation";
import { SendBookingNotificationDialog } from "@/components/booking/SendBookingNotificationDialog";
import {
  BOOKING_CLIENT_TYPES,
  CLIENT_TYPE_META,
  type BookingClientType,
} from "@/lib/clientTypeMeta";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { countries, flagEmoji } from "@/lib/countries";
import { formatPrice } from "@/lib/formatPrice";

interface PhoneBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "venue" | "slot" | "therapist" | "client" | "confirm" | "done";

const STEPS: { key: Step; labelKey: string }[] = [
  { key: "venue", labelKey: "phoneBooking.steps.venue" },
  { key: "slot", labelKey: "phoneBooking.steps.slot" },
  { key: "therapist", labelKey: "phoneBooking.steps.therapist" },
  { key: "client", labelKey: "phoneBooking.steps.client" },
  { key: "confirm", labelKey: "phoneBooking.steps.confirm" },
];

function getInitials(first: string, last: string): string {
  return `${(first[0] || "").toUpperCase()}${(last[0] || "").toUpperCase()}`;
}

function generateDaySlots(
  opening: string,
  closing: string,
  interval: number,
): string[] {
  const out: string[] = [];
  const [oh, om] = opening.split(":").map(Number);
  const [ch, cm] = closing.split(":").map(Number);
  const start = (oh || 0) * 60 + (om || 0);
  const end = (ch || 0) * 60 + (cm || 0);
  for (let m = start; m < end; m += interval) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return out;
}

export default function PhoneBookingDialog({
  open,
  onOpenChange,
}: PhoneBookingDialogProps) {
  const { t } = useTranslation("admin");
  const { isConcierge, hotelIds } = useUser();

  const [step, setStep] = useState<Step>("venue");
  const [hotelId, setHotelId] = useState<string>(
    isConcierge && hotelIds.length > 0 ? hotelIds[0] : "",
  );
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState<string>("");
  const [therapistId, setTherapistId] = useState<string>("");
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [countryCode, setCountryCode] = useState("+33");
  const [phone, setPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [clientType, setClientType] = useState<BookingClientType>("external");

  const [createdBooking, setCreatedBooking] = useState<{
    id: string;
    booking_id: number;
    hotel_name: string;
  } | null>(null);
  const [isNotificationDialogOpen, setIsNotificationDialogOpen] = useState(false);

  const { data: hotels } = useQuery({
    queryKey: ["phone-booking-hotels"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("hotels")
        .select(
          "id, name, timezone, currency, opening_time, closing_time, slot_interval",
        )
        .order("name");
      return data || [];
    },
  });

  const selectedHotel = useMemo(
    () => hotels?.find((h) => h.id === hotelId),
    [hotels, hotelId],
  );
  const slotInterval = (selectedHotel as { slot_interval?: number } | undefined)?.slot_interval || 30;
  const openingTime = selectedHotel?.opening_time || "09:00";
  const closingTime = selectedHotel?.closing_time || "20:00";

  const { data: treatments } = useQuery({
    queryKey: ["phone-booking-treatments", hotelId],
    enabled: open && !!hotelId,
    queryFn: async () => {
      let q = supabase
        .from("treatment_menus")
        .select("*")
        .in("status", ["Actif", "active", "Active"])
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name");
      if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
      const { data } = await q;
      return data || [];
    },
  });

  const {
    cart,
    setCart,
    addToCart,
    incrementCart,
    decrementCart,
    getCartQuantity,
    flatIds,
    totalPrice,
    totalDuration,
    cartDetails,
  } = useBookingCart(treatments);

  const { isSlotAvailable, isLoading: isAvailabilityLoading } =
    useSlotAvailability({
      hotelId,
      dates: [date],
      slotInterval,
    });

  const daySlots = useMemo(
    () => generateDaySlots(openingTime, closingTime, slotInterval),
    [openingTime, closingTime, slotInterval],
  );

  const {
    data: availableTherapists = [],
    isLoading: isTherapistsLoading,
  } = useAvailableTherapistsForSlot({
    hotelId,
    date,
    time,
    durationMinutes: totalDuration || 60,
    treatmentIds: flatIds,
  });

  const mutation = useCreateBookingMutation({
    hotels: hotels as unknown as Parameters<typeof useCreateBookingMutation>[0]["hotels"],
    therapists: availableTherapists as unknown as Parameters<typeof useCreateBookingMutation>[0]["therapists"],
    onSuccess: (data) => {
      if (!data) return;
      setCreatedBooking({
        id: data.id,
        booking_id: data.booking_id,
        hotel_name: data.hotel_name || "",
      });
      setStep("done");
      if (clientType !== "external") {
        setIsNotificationDialogOpen(true);
      }
    },
  });

  const resetAll = () => {
    setStep("venue");
    setHotelId(isConcierge && hotelIds.length > 0 ? hotelIds[0] : "");
    setDate(undefined);
    setTime("");
    setTherapistId("");
    setTherapistChoiceMade(false);
    setClientFirstName("");
    setClientLastName("");
    setPhone("");
    setClientEmail("");
    setRoomNumber("");
    setClientType("external");
    setCart([]);
    setCreatedBooking(null);
  };

  const handleClose = () => {
    resetAll();
    onOpenChange(false);
  };

  const [therapistChoiceMade, setTherapistChoiceMade] = useState(false);

  const canSubmit =
    !!hotelId &&
    !!date &&
    !!time &&
    therapistChoiceMade &&
    cart.length > 0 &&
    clientFirstName.trim().length > 0 &&
    clientLastName.trim().length > 0 &&
    phone.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit || !date) return;
    mutation.mutate({
      hotelId,
      clientFirstName: clientFirstName.trim(),
      clientLastName: clientLastName.trim(),
      clientEmail: clientEmail.trim() || undefined, // <-- L'EMAIL EST AJOUTÉ ICI !
      phone: phone.trim(),
      countryCode,
      roomNumber: roomNumber.trim(),
      clientType,
      clientNote: "",
      date: format(date, "yyyy-MM-dd"),
      time,
      therapistId,
      slot2Date: null,
      slot2Time: null,
      slot3Date: null,
      slot3Time: null,
      treatmentIds: flatIds,
      totalPrice,
      totalDuration,
      isAdmin: true,
      isOutOfHours: false,
      surchargeAmount: 0,
    });
  };

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleClose();
        }}
      >
        <DialogContent className="max-w-xl max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="text-lg font-normal">
              {t("phoneBooking.title")}
            </DialogTitle>
            {step !== "done" && (
              <div className="pt-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  {STEPS.map((s, i) => (
                    <div
                      key={s.key}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-colors",
                        i <= stepIndex ? "bg-primary" : "bg-muted",
                      )}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[10px] font-medium">
                  {STEPS.map((s, i) => (
                    <span
                      key={s.key}
                      className={cn(
                        "flex-1 truncate",
                        i === 0 ? "text-left" : i === STEPS.length - 1 ? "text-right" : "text-center",
                        i === stepIndex ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {t(s.labelKey)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {step === "venue" && (
              <VenueTreatmentStep
                t={t}
                hotels={hotels || []}
                hotelId={hotelId}
                setHotelId={(id) => {
                  setHotelId(id);
                  setCart([]);
                  setTherapistId("");
                  setTherapistChoiceMade(false);
                }}
                isConcierge={isConcierge}
                treatments={treatments || []}
                cart={cart}
                addToCart={addToCart}
                incrementCart={incrementCart}
                decrementCart={decrementCart}
                getCartQuantity={getCartQuantity}
                totalPrice={totalPrice}
                totalDuration={totalDuration}
                currency={selectedHotel?.currency || "EUR"}
              />
            )}

            {step === "slot" && (
              <SlotStep
                t={t}
                date={date}
                setDate={(d) => {
                  setDate(d);
                  setTime("");
                  setTherapistId("");
                }}
                time={time}
                setTime={(v) => {
                  setTime(v);
                  setTherapistId("");
                }}
                daySlots={daySlots}
                isSlotAvailable={isSlotAvailable}
                isAvailabilityLoading={isAvailabilityLoading}
                slotInterval={slotInterval}
              />
            )}

            {step === "therapist" && (
              <TherapistStep
                t={t}
                therapists={availableTherapists}
                isLoading={isTherapistsLoading}
                therapistId={therapistId}
                setTherapistId={setTherapistId}
                broadcast={therapistChoiceMade && !therapistId}
                onPickBroadcast={() => {
                  setTherapistId("");
                  setTherapistChoiceMade(true);
                }}
                onPickTherapist={(id) => {
                  setTherapistId(id);
                  setTherapistChoiceMade(true);
                }}
              />
            )}

            {step === "client" && (
              <ClientStep
                t={t}
                clientFirstName={clientFirstName}
                setClientFirstName={setClientFirstName}
                clientLastName={clientLastName}
                setClientLastName={setClientLastName}
                countryCode={countryCode}
                setCountryCode={setCountryCode}
                phone={phone}
                setPhone={setPhone}
                clientEmail={clientEmail}
                setClientEmail={setClientEmail}
                roomNumber={roomNumber}
                setRoomNumber={setRoomNumber}
                clientType={clientType}
                setClientType={setClientType}
              />
            )}

            {step === "confirm" && (
              <ConfirmStep
                t={t}
                hotelName={selectedHotel?.name || ""}
                cartDetails={cartDetails}
                totalPrice={totalPrice}
                totalDuration={totalDuration}
                currency={selectedHotel?.currency || "EUR"}
                date={date}
                time={time}
                therapist={availableTherapists.find((x) => x.id === therapistId)}
                clientFirstName={clientFirstName}
                clientLastName={clientLastName}
                countryCode={countryCode}
                phone={phone}
                clientEmail={clientEmail}
              />
            )}

            {step === "done" && createdBooking && (
              <DoneStep
                t={t}
                createdBooking={createdBooking}
                clientFirstName={clientFirstName}
                clientLastName={clientLastName}
                totalPrice={totalPrice}
                currency={selectedHotel?.currency || "EUR"}
                clientType={clientType}
                onSendPaymentLink={() => setIsNotificationDialogOpen(true)}
                onClose={handleClose}
              />
            )}
          </div>

          {step !== "done" && (
            <div className="border-t p-3 flex items-center justify-between shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (step === "venue") handleClose();
                  else if (step === "slot") setStep("venue");
                  else if (step === "therapist") setStep("slot");
                  else if (step === "client") setStep("therapist");
                  else if (step === "confirm") setStep("client");
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                {step === "venue" ? t("phoneBooking.ui.cancel") : t("phoneBooking.ui.back")}
              </Button>

              {step !== "confirm" ? (
                <Button
                  type="button"
                  onClick={() => {
                    if (step === "venue") {
                      if (!hotelId) {
                        toast({
                          title: t("phoneBooking.errors.selectVenue"),
                          variant: "destructive",
                        });
                        return;
                      }
                      if (cart.length === 0) {
                        toast({
                          title: t("phoneBooking.errors.selectTreatment"),
                          variant: "destructive",
                        });
                        return;
                      }
                      setStep("slot");
                    } else if (step === "slot") {
                      if (!date || !time) {
                        toast({
                          title: t("phoneBooking.errors.selectSlot"),
                          variant: "destructive",
                        });
                        return;
                      }
                      setStep("therapist");
                    } else if (step === "therapist") {
                      if (!therapistChoiceMade) {
                        toast({
                          title: t("phoneBooking.errors.selectTherapist"),
                          variant: "destructive",
                        });
                        return;
                      }
                      setStep("client");
                    } else if (step === "client") {
                      if (
                        !clientFirstName.trim() ||
                        !clientLastName.trim() ||
                        !phone.trim()
                      ) {
                        toast({
                          title: t("phoneBooking.errors.fillClient"),
                          variant: "destructive",
                        });
                        return;
                      }
                      if (clientType === "hotel" && !roomNumber.trim()) {
                        toast({
                          title: t("phoneBooking.errors.roomRequired"),
                          variant: "destructive",
                        });
                        return;
                      }
                      setStep("confirm");
                    }
                  }}
                >
                  {t("phoneBooking.ui.next")}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || mutation.isPending}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  {mutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {clientType === "external"
                    ? t("phoneBooking.confirm.createAndSend")
                    : t("phoneBooking.confirm.createAndNotify")}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {createdBooking && (
        <SendBookingNotificationDialog
          open={isNotificationDialogOpen}
          onOpenChange={setIsNotificationDialogOpen}
          booking={{
            id: createdBooking.id,
            booking_id: createdBooking.booking_id,
            client_first_name: clientFirstName,
            client_last_name: clientLastName,
            client_email: clientEmail || undefined,
            phone: `${countryCode} ${phone}`,
            room_number: roomNumber || undefined,
            booking_date: date ? format(date, "yyyy-MM-dd") : "",
            booking_time: time,
            total_price: totalPrice,
            hotel_name: createdBooking.hotel_name,
            treatments: cartDetails.map((item) => {
              const tr = item.treatment as { name?: string; price?: number | null } | undefined;
              return {
                name: tr?.name || "Service",
                price: (tr?.price || 0) * item.quantity,
              };
            }),
            currency: selectedHotel?.currency || "EUR",
          }}
          onSuccess={() => {
            setIsNotificationDialogOpen(false);
            handleClose();
          }}
        />
      )}
    </>
  );
}

// ---------- Step components ----------

interface VenueTreatmentStepProps {
  t: (k: string) => string;
  hotels: Array<{ id: string; name: string; currency?: string | null }>;
  hotelId: string;
  setHotelId: (id: string) => void;
  isConcierge: boolean;
  treatments: Array<{
    id: string;
    name?: string;
    price?: number | null;
    duration?: number | null;
  }>;
  cart: Array<{ treatmentId: string; quantity: number }>;
  addToCart: (id: string) => void;
  incrementCart: (id: string) => void;
  decrementCart: (id: string) => void;
  getCartQuantity: (id: string) => number;
  totalPrice: number;
  totalDuration: number;
  currency: string;
}

function VenueTreatmentStep({
  t,
  hotels,
  hotelId,
  setHotelId,
  isConcierge,
  treatments,
  addToCart,
  incrementCart,
  decrementCart,
  getCartQuantity,
  totalPrice,
  totalDuration,
  currency,
}: VenueTreatmentStepProps) {
  const [treatmentSearch, setTreatmentSearch] = useState("");

  const filteredTreatments = useMemo(() => {
    const q = treatmentSearch.trim().toLowerCase();
    if (!q) return treatments;
    return treatments.filter((tr) => tr.name?.toLowerCase().includes(q));
  }, [treatments, treatmentSearch]);

  return (
    <div className="space-y-4">
      {!isConcierge && (
        <div>
          <Label>{t("phoneBooking.venue.label")}</Label>
          <Select value={hotelId} onValueChange={setHotelId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={t("phoneBooking.venue.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {hotels.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {hotelId && (
        <div>
          <Label className="block mb-2">{t("phoneBooking.treatment.label")}</Label>
          {treatments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("phoneBooking.treatment.empty")}
            </p>
          ) : (
            <>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={treatmentSearch}
                onChange={(e) => setTreatmentSearch(e.target.value)}
                placeholder={t("phoneBooking.treatment.searchPlaceholder")}
                className="pl-8 h-9"
              />
            </div>
            <ScrollArea className="h-[280px] pr-2">
              <div className="space-y-2">
                {filteredTreatments.map((tr) => {
                  const qty = getCartQuantity(tr.id);
                  return (
                    <div
                      key={tr.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{tr.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {tr.duration || 0} min ·{" "}
                          {formatPrice(tr.price || 0, currency)}
                        </p>
                      </div>
                      {qty === 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addToCart(tr.id)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            onClick={() => decrementCart(tr.id)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm font-medium">
                            {qty}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            onClick={() => incrementCart(tr.id)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            </>
          )}
        </div>
      )}

      {totalPrice > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {t("phoneBooking.treatment.summary")} · {totalDuration} min
          </span>
          <span className="font-semibold">
            {formatPrice(totalPrice, currency)}
          </span>
        </div>
      )}
    </div>
  );
}

interface SlotStepProps {
  t: (k: string) => string;
  date: Date | undefined;
  setDate: (d: Date | undefined) => void;
  time: string;
  setTime: (t: string) => void;
  daySlots: string[];
  isSlotAvailable: (date: Date | undefined, time: string, interval?: number) => boolean;
  isAvailabilityLoading: (date: Date | undefined) => boolean;
  slotInterval: number;
}

function SlotStep({
  t,
  date,
  setDate,
  time,
  setTime,
  daySlots,
  isSlotAvailable,
  isAvailabilityLoading,
  slotInterval,
}: SlotStepProps) {
  const loading = isAvailabilityLoading(date);
  return (
    <div className="space-y-4">
      <div>
        <Label className="flex items-center gap-2 mb-2">
          <CalendarIcon className="h-4 w-4" />
          {t("phoneBooking.slot.date")}
        </Label>
        <div className="rounded-lg border p-2 flex justify-center">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            disabled={(d) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return d < today;
            }}
            locale={fr}
          />
        </div>
      </div>

      {date && (
        <div>
          <Label className="block mb-2">{t("phoneBooking.slot.time")}</Label>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t("phoneBooking.slot.loading")}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {daySlots.map((s) => {
                const available = isSlotAvailable(date, s, slotInterval);
                const selected = time === s;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!available}
                    onClick={() => setTime(s)}
                    className={cn(
                      "rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                      selected && "bg-primary text-primary-foreground border-primary",
                      !selected && available && "hover:bg-muted",
                      !available && "opacity-40 cursor-not-allowed line-through",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TherapistStepProps {
  t: (k: string) => string;
  therapists: AvailableTherapist[];
  isLoading: boolean;
  therapistId: string;
  setTherapistId: (id: string) => void;
  broadcast: boolean;
  onPickBroadcast: () => void;
  onPickTherapist: (id: string) => void;
}

function genderLabel(gender: string | null | undefined): string | null {
  if (gender === "female") return "F";
  if (gender === "male") return "H";
  return null;
}

function TherapistStep({
  t,
  therapists,
  isLoading,
  therapistId,
  broadcast,
  onPickBroadcast,
  onPickTherapist,
}: TherapistStepProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        {t("phoneBooking.therapist.loading")}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Label className="block mb-1">{t("phoneBooking.therapist.label")}</Label>
      <ScrollArea className="h-[360px] pr-2">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onPickBroadcast}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              broadcast ? "border-primary bg-primary/5" : "hover:bg-muted",
            )}
          >
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {t("phoneBooking.therapist.broadcastTitle")}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {t("phoneBooking.therapist.broadcastDesc")}
              </p>
            </div>
            {broadcast && <Check className="h-4 w-4 text-primary" />}
          </button>

          {therapists.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("phoneBooking.therapist.empty")}
            </div>
          ) : (
            therapists.map((th) => {
              const selected = therapistId === th.id;
              const g = genderLabel(th.gender);
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => onPickTherapist(th.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    selected ? "border-primary bg-primary/5" : "hover:bg-muted",
                  )}
                >
                  <Avatar className="h-12 w-12">
                    {th.profile_image && (
                      <AvatarImage
                        src={th.profile_image}
                        alt={`${th.first_name} ${th.last_name}`}
                      />
                    )}
                    <AvatarFallback>
                      {getInitials(th.first_name, th.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate flex items-center gap-1.5">
                      <span className="truncate">{th.first_name} {th.last_name}</span>
                      {g && (
                        <span className="shrink-0 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                          {g}
                        </span>
                      )}
                    </p>
                    {th.skills && th.skills.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        {th.skills.slice(0, 3).join(" · ")}
                      </p>
                    )}
                  </div>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function CountryCodePhone({
  countryCode,
  setCountryCode,
  phone,
  setPhone,
}: {
  countryCode: string;
  setCountryCode: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const current = countries.find((c) => c.code === countryCode);
  const filtered = countrySearch.trim()
    ? countries.filter(
        (c) =>
          c.label.toLowerCase().includes(countrySearch.toLowerCase()) ||
          c.code.includes(countrySearch),
      )
    : countries;

  return (
    <div className="flex">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="rounded-r-none border-r-0 px-2.5 shrink-0 font-normal"
          >
            {current ? (
              <span className="mr-1">{flagEmoji(current.flag)}</span>
            ) : null}
            <span className="tabular-nums text-sm">{countryCode}</span>
            <ChevronDown className="ml-1 h-3 w-3 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-2 border-b">
            <Input
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              placeholder="Search..."
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <ScrollArea className="h-52">
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  setCountryCode(c.code);
                  setPopoverOpen(false);
                  setCountrySearch("");
                }}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-sm hover:bg-muted transition-colors",
                  countryCode === c.code && "bg-primary/10",
                )}
              >
                <span className="w-7 shrink-0">{flagEmoji(c.flag)}</span>
                <span className="flex-1 text-left">{c.label}</span>
                <span className="ml-2 shrink-0 tabular-nums text-muted-foreground text-xs">
                  {c.code}
                </span>
              </button>
            ))}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <Input
        className="rounded-l-none flex-1"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="612345678"
      />
    </div>
  );
}

interface ClientStepProps {
  t: (k: string) => string;
  clientFirstName: string;
  setClientFirstName: (v: string) => void;
  clientLastName: string;
  setClientLastName: (v: string) => void;
  countryCode: string;
  setCountryCode: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  clientEmail: string;
  setClientEmail: (v: string) => void;
  roomNumber: string;
  setRoomNumber: (v: string) => void;
  clientType: BookingClientType;
  setClientType: (v: BookingClientType) => void;
}

interface CustomerResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

function ClientStep({
  t,
  clientFirstName,
  setClientFirstName,
  clientLastName,
  setClientLastName,
  countryCode,
  setCountryCode,
  phone,
  setPhone,
  clientEmail,
  setClientEmail,
  roomNumber,
  setRoomNumber,
  clientType,
  setClientType,
}: ClientStepProps) {
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const trimmed = search.trim();
  const isPhone = /^\+?\d[\d\s]{2,}$/.test(trimmed);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["phone-booking-customer-search", trimmed],
    enabled: trimmed.length >= 3,
    staleTime: 30_000,
    queryFn: async (): Promise<CustomerResult[]> => {
      let q = supabase
        .from("customers")
        .select("id, first_name, last_name, phone, email")
        .limit(5);

      if (isPhone) {
        const normalized = trimmed.replace(/\s/g, "");
        q = q.ilike("phone", `%${normalized}%`);
      } else {
        q = q.or(
          `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`,
        );
      }

      const { data } = await q;
      return (data as CustomerResult[]) || [];
    },
  });

  const handleSelect = (c: CustomerResult) => {
    setSelectedCustomerId(c.id);
    if (c.first_name) setClientFirstName(c.first_name);
    if (c.last_name) setClientLastName(c.last_name);
    if (c.email) setClientEmail(c.email);
    if (c.phone) {
      // Match against known country codes (longest first to avoid partial matches like +336)
      const sorted = [...countries].sort((a, b) => b.code.length - a.code.length);
      const match = sorted.find((cc) => c.phone!.startsWith(cc.code));
      if (match) {
        setCountryCode(match.code);
        setPhone(c.phone.slice(match.code.length).trim());
      } else {
        setPhone(c.phone);
      }
    }
    setSearch("");
  };

  return (
    <div className="space-y-3">
      {/* Customer search */}
      <div className="relative">
        <Label className="flex items-center gap-1.5 mb-1">
          <Search className="h-3.5 w-3.5" />
          {t("phoneBooking.client.search")}
        </Label>
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedCustomerId(null);
          }}
          placeholder={t("phoneBooking.client.searchPlaceholder")}
          autoFocus
        />
        {trimmed.length >= 3 && !selectedCustomerId && (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg border bg-popover shadow-md">
            {isFetching ? (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("phoneBooking.client.searching")}
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {t("phoneBooking.client.noResults")}
              </div>
            ) : (
              results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg"
                >
                  <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">
                    {c.first_name} {c.last_name}
                  </span>
                  {c.phone && (
                    <span className="text-muted-foreground text-xs ml-auto">
                      {c.phone}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedCustomerId && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-3 py-1.5 text-xs text-green-700 dark:text-green-300">
          <UserCheck className="h-3.5 w-3.5" />
          {t("phoneBooking.client.existingClient")}
        </div>
      )}

      {/* Form fields */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>{t("phoneBooking.client.firstName")}</Label>
          <Input
            value={clientFirstName}
            onChange={(e) => setClientFirstName(e.target.value)}
          />
        </div>
        <div>
          <Label>{t("phoneBooking.client.lastName")}</Label>
          <Input
            value={clientLastName}
            onChange={(e) => setClientLastName(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>{t("phoneBooking.client.phone")}</Label>
        <CountryCodePhone
          countryCode={countryCode}
          setCountryCode={setCountryCode}
          phone={phone}
          setPhone={setPhone}
        />
      </div>
      <div>
        <Label>
          {t("phoneBooking.client.email")}{" "}
          <span className="text-muted-foreground text-xs">
            ({t("phoneBooking.client.emailHint")})
          </span>
        </Label>
        <Input
          type="email"
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
        />
      </div>
      <div>
        <Label>{t("phoneBooking.client.clientType")}</Label>
        <Select value={clientType} onValueChange={(v) => setClientType(v as BookingClientType)}>
          <SelectTrigger className="mt-1">
            <SelectValue>
              <span className="flex items-center gap-2">
                <img
                  src={CLIENT_TYPE_META[clientType].logo}
                  alt=""
                  className="w-4 h-4 shrink-0"
                />
                <span>{t(CLIENT_TYPE_META[clientType].labelKey)}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {BOOKING_CLIENT_TYPES.map((ct) => (
              <SelectItem key={ct} value={ct}>
                <span className="flex items-center gap-2">
                  <img
                    src={CLIENT_TYPE_META[ct].logo}
                    alt=""
                    className="w-4 h-4 shrink-0"
                  />
                  <span>{t(CLIENT_TYPE_META[ct].labelKey)}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>
          {t("phoneBooking.client.room")}{" "}
          {clientType === "hotel" ? (
            <span className="text-primary">*</span>
          ) : (
            <span className="text-muted-foreground text-xs">
              ({t("phoneBooking.ui.optional")})
            </span>
          )}
        </Label>
        <Input
          value={roomNumber}
          onChange={(e) => setRoomNumber(e.target.value)}
          required={clientType === "hotel"}
        />
      </div>
    </div>
  );
}

interface ConfirmStepProps {
  t: (k: string) => string;
  hotelName: string;
  cartDetails: Array<{
    treatmentId: string;
    quantity: number;
    treatment: { name?: string; price?: number | null } | undefined;
  }>;
  totalPrice: number;
  totalDuration: number;
  currency: string;
  date: Date | undefined;
  time: string;
  therapist: AvailableTherapist | undefined;
  clientFirstName: string;
  clientLastName: string;
  countryCode: string;
  phone: string;
  clientEmail: string;
}

function ConfirmStep({
  t,
  hotelName,
  cartDetails,
  totalPrice,
  totalDuration,
  currency,
  date,
  time,
  therapist,
  clientFirstName,
  clientLastName,
  countryCode,
  phone,
  clientEmail,
}: ConfirmStepProps) {
  return (
    <div className="space-y-3 text-sm">
      <Row label={t("phoneBooking.confirm.venue")} value={hotelName} />
      <Row
        label={t("phoneBooking.confirm.when")}
        value={`${date ? format(date, "EEEE d MMMM yyyy", { locale: fr }) : ""} · ${time}`}
      />
      <Row
        label={t("phoneBooking.confirm.therapist")}
        value={
          therapist ? `${therapist.first_name} ${therapist.last_name}` : ""
        }
      />
      <div>
        <p className="text-muted-foreground text-xs mb-1">
          {t("phoneBooking.confirm.treatments")}
        </p>
        <div className="rounded-lg border divide-y">
          {cartDetails.map((item, i) => (
            <div key={i} className="flex justify-between px-3 py-2">
              <span>
                {item.quantity}× {item.treatment?.name}
              </span>
              <span className="text-muted-foreground">
                {formatPrice(
                  (item.treatment?.price || 0) * item.quantity,
                  currency,
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between rounded-lg bg-muted px-3 py-2 font-semibold">
        <span>
          {t("phoneBooking.confirm.total")} · {totalDuration} min
        </span>
        <span>{formatPrice(totalPrice, currency)}</span>
      </div>
      <Row
        label={t("phoneBooking.confirm.client")}
        value={`${clientFirstName} ${clientLastName}`}
      />
      <Row
        label={t("phoneBooking.client.phone")}
        value={`${countryCode} ${phone}`}
      />
      {clientEmail && (
        <Row label={t("phoneBooking.client.email")} value={clientEmail} />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

interface DoneStepProps {
  t: (k: string) => string;
  createdBooking: { id: string; booking_id: number; hotel_name: string };
  clientFirstName: string;
  clientLastName: string;
  totalPrice: number;
  currency: string;
  clientType: BookingClientType;
  onSendPaymentLink: () => void;
  onClose: () => void;
}

function DoneStep({
  t,
  createdBooking,
  clientFirstName,
  clientLastName,
  totalPrice,
  currency,
  clientType,
  onSendPaymentLink,
  onClose,
}: DoneStepProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-6">
      <CheckCircle2 className="h-12 w-12 text-green-500" />
      <div className="text-center">
        <h3 className="text-lg font-normal">
          {t("phoneBooking.done.title")}
        </h3>
        <p className="text-sm text-muted-foreground">
          #{createdBooking.booking_id} — {clientFirstName} {clientLastName}
        </p>
        <p className="text-sm font-medium mt-1">
          {formatPrice(totalPrice, currency)}
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <Button
          type="button"
          onClick={onSendPaymentLink}
          className="bg-foreground text-background hover:bg-foreground/90"
        >
          <Send className="h-4 w-4 mr-2" />
          {clientType === "external"
            ? t("phoneBooking.done.sendLink")
            : t("phoneBooking.done.sendNotification")}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("phoneBooking.ui.close")}
        </Button>
      </div>
    </div>
  );
}
