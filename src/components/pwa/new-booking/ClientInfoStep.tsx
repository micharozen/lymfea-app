import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { CalendarIcon, ChevronDown, ArrowRight, Search, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CustomerResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

interface Hotel {
  id: string;
  name: string;
  timezone?: string | null;
  currency?: string | null;
}

interface VenueTherapist {
  id: string;
  first_name: string;
  last_name: string;
}

interface ClientInfoStepProps {
  hotels: Hotel[];
  selectedHotelId: string;
  setSelectedHotelId: (id: string) => void;
  assignToOther: boolean;
  setAssignToOther: (v: boolean) => void;
  venueTherapists: VenueTherapist[];
  venueTherapistsLoading: boolean;
  selectedTherapistId: string;
  setSelectedTherapistId: (id: string) => void;
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
  assignToOther,
  setAssignToOther,
  venueTherapists,
  venueTherapistsLoading,
  selectedTherapistId,
  setSelectedTherapistId,
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

  // Recherche d'un client existant
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const trimmedCustomerSearch = customerSearch.trim();
  const isPhoneSearch = /^\+?\d[\d\s]{2,}$/.test(trimmedCustomerSearch);

  const { data: customerResults = [], isFetching: isSearchingCustomers } = useQuery({
    queryKey: ["pwa-new-booking-customer-search", trimmedCustomerSearch],
    enabled: trimmedCustomerSearch.length >= 3 && !selectedCustomerId,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select("id, first_name, last_name, phone, email")
        .limit(5);
      if (isPhoneSearch) {
        const normalized = trimmedCustomerSearch.replace(/\s/g, "");
        q = q.ilike("phone", `%${normalized}%`);
      } else {
        q = q.or(
          `first_name.ilike.%${trimmedCustomerSearch}%,last_name.ilike.%${trimmedCustomerSearch}%`,
        );
      }
      const { data } = await q;
      return (data as CustomerResult[]) || [];
    },
  });

  const handleSelectCustomer = (c: CustomerResult) => {
    setSelectedCustomerId(c.id);
    if (c.first_name) setClientFirstName(c.first_name);
    if (c.last_name) setClientLastName(c.last_name);
    if (c.email) setEmail(c.email);
    if (c.phone) {
      const sorted = [...countries].sort((a, b) => b.code.length - a.code.length);
      const match = sorted.find((cc) => c.phone!.startsWith(cc.code));
      if (match) {
        setCountryCode(match.code);
        setPhone(formatPhoneNumber(c.phone.slice(match.code.length).trim(), match.code));
      } else {
        setPhone(c.phone);
      }
    }
    setCustomerSearch(`${c.first_name || ""} ${c.last_name || ""}`.trim());
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Hotel selection — masqué si un seul lieu (auto-sélectionné) */}
        {hotels.length > 1 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {t("newBooking.selectHotel", "Lieu")} <span className="text-primary">*</span>
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

        {/* Assigner à un autre thérapeute */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
            <Checkbox
              checked={assignToOther}
              onCheckedChange={(v) => setAssignToOther(v === true)}
            />
            {t("newBooking.assignToOther", "L'associer à un autre thérapeute")}
          </label>
          {assignToOther && (
            <Select
              value={selectedTherapistId}
              onValueChange={setSelectedTherapistId}
              disabled={venueTherapistsLoading || venueTherapists.length === 0}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue
                  placeholder={
                    venueTherapistsLoading
                      ? t("newBooking.loadingTherapists", "Chargement…")
                      : venueTherapists.length === 0
                        ? t("newBooking.noOtherTherapist", "Aucun autre thérapeute")
                        : t("newBooking.selectTherapist", "Sélectionner un thérapeute")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {venueTherapists.map((tp) => (
                  <SelectItem key={tp.id} value={tp.id}>
                    {[tp.first_name, tp.last_name].filter(Boolean).join(" ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Customer search (existing clients) */}
        <div className="relative">
          <Label className="flex items-center gap-1.5 mb-1.5 text-xs font-medium">
            <Search className="h-3.5 w-3.5" />
            {t("newBooking.searchClient", "Rechercher un client existant")}
          </Label>
          <Input
            value={customerSearch}
            onChange={(e) => {
              setCustomerSearch(e.target.value);
              setSelectedCustomerId(null);
            }}
            placeholder={t("newBooking.searchClientPlaceholder", "Nom, prénom ou téléphone…")}
            className="h-9 text-xs"
          />
          {trimmedCustomerSearch.length >= 3 && !selectedCustomerId && (
            <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg border bg-popover shadow-md">
              {isSearchingCustomers ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("newBooking.searching", "Recherche…")}
                </div>
              ) : customerResults.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {t("newBooking.noClientFound", "Aucun client trouvé")}
                </div>
              ) : (
                customerResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className="w-full flex flex-col items-start px-3 py-2 text-sm text-left hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg"
                  >
                    <span className="font-medium">
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[c.phone, c.email].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Client name */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {t("newBooking.firstName", "Prénom")} <span className="text-primary">*</span>
            </Label>
            <Input
              value={clientFirstName}
              onChange={(e) => setClientFirstName(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {t("newBooking.lastName", "Nom")} <span className="text-primary">*</span>
            </Label>
            <Input
              value={clientLastName}
              onChange={(e) => setClientLastName(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {t("newBooking.phone", "Téléphone")} <span className="text-primary">*</span>
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
            inputClassName="text-xs"
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
              className="h-9 text-xs"
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
              className="h-9 text-xs"
              placeholder="1002"
            />
          </div>
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Date <span className="text-primary">*</span></Label>
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
              {t("newBooking.time", "Heure")} <span className="text-primary">*</span>
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
      <div className="px-4 py-3 border-t border-primary/20 shrink-0">
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          onClick={onNext}
        >
          {t("newBooking.next", "Suivant")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
