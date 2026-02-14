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
import { countries, formatPhoneNumber } from "@/lib/phone";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, ChevronDown, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Hotel {
  id: string;
  name: string;
  timezone?: string | null;
  currency?: string | null;
}

interface ClientInfoStepProps {
  hotels: Hotel[];
  selectedHotelId: string;
  setSelectedHotelId: (id: string) => void;
  clientFirstName: string;
  setClientFirstName: (v: string) => void;
  clientLastName: string;
  setClientLastName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  countryCode: string;
  setCountryCode: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  roomNumber: string;
  setRoomNumber: (v: string) => void;
  selectedDate: Date | undefined;
  setSelectedDate: (d: Date | undefined) => void;
  selectedTime: string;
  setSelectedTime: (t: string) => void;
  calendarOpen: boolean;
  setCalendarOpen: (v: boolean) => void;
  hourOpen: boolean;
  setHourOpen: (v: boolean) => void;
  minuteOpen: boolean;
  setMinuteOpen: (v: boolean) => void;
  onNext: () => void;
}

export function ClientInfoStep({
  hotels,
  selectedHotelId,
  setSelectedHotelId,
  clientFirstName,
  setClientFirstName,
  clientLastName,
  setClientLastName,
  phone,
  setPhone,
  countryCode,
  setCountryCode,
  email,
  setEmail,
  roomNumber,
  setRoomNumber,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  calendarOpen,
  setCalendarOpen,
  hourOpen,
  setHourOpen,
  minuteOpen,
  setMinuteOpen,
  onNext,
}: ClientInfoStepProps) {
  const { t } = useTranslation("pwa");

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Hotel selection */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {t("newBooking.selectHotel", "Lieu")} <span className="text-gold-400">*</span>
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

        {/* Client name */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {t("newBooking.firstName", "Prénom")} <span className="text-gold-400">*</span>
            </Label>
            <Input
              value={clientFirstName}
              onChange={(e) => setClientFirstName(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {t("newBooking.lastName", "Nom")} <span className="text-gold-400">*</span>
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
            {t("newBooking.phone", "Téléphone")} <span className="text-gold-400">*</span>
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
            <Label className="text-xs font-medium">Date <span className="text-gold-400">*</span></Label>
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
              {t("newBooking.time", "Heure")} <span className="text-gold-400">*</span>
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
      <div className="px-4 py-3 border-t border-gold-400/20 shrink-0">
        <Button
          className="w-full bg-gold-400 text-black hover:bg-gold-300 font-medium"
          onClick={onNext}
        >
          {t("newBooking.next", "Suivant")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
