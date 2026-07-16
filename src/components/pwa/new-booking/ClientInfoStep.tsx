import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PhoneNumberField } from "@/components/PhoneNumberField";
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
import { BOOKING_CLIENT_TYPES, CLIENT_TYPE_META, type BookingClientType } from "@/lib/clientTypeMeta";
import { countries, formatPhoneNumber } from "@/lib/phone";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, ChevronDown, Search, Loader2 } from "lucide-react";
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
  clientType: BookingClientType;
  setClientType: (v: BookingClientType) => void;
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
  clientType,
  setClientType,
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

  const showResults = trimmedCustomerSearch.length >= 3 && !selectedCustomerId;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="app-scroll flex-1">
        <div className="form" data-screen-label="Étape infos">
          {/* Lieu — masqué si un seul lieu (auto-sélectionné) */}
          {hotels.length > 1 && (
            <label className="field">
              <span className="flab">
                {t("newBooking.selectHotel", "Lieu")}<em> *</em>
              </span>
              <div className="sel-wrap">
                <select value={selectedHotelId} onChange={(e) => setSelectedHotelId(e.target.value)}>
                  <option value="">{t("newBooking.selectHotel", "Sélectionner un lieu")}</option>
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
            </label>
          )}

          {/* Type de client + Chambre (Chambre uniquement pour un client hôtel) */}
          <div className="frow">
            <label className="field">
              <span className="flab">
                {t("bookings.clientType.label", { ns: "admin" })}<em> *</em>
              </span>
              <div className="ct-select">
                <Select
                  value={clientType}
                  onValueChange={(v) => {
                    setClientType(v as BookingClientType);
                    if (v !== "hotel") setRoomNumber("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        <img src={CLIENT_TYPE_META[clientType].logo} alt="" className="w-4 h-4 shrink-0" />
                        <span>{t(CLIENT_TYPE_META[clientType].labelKey, { ns: "admin" })}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_CLIENT_TYPES.map((ct) => (
                      <SelectItem key={ct} value={ct}>
                        <span className="flex items-center gap-2">
                          <img src={CLIENT_TYPE_META[ct].logo} alt="" className="w-4 h-4 shrink-0" />
                          <span>{t(CLIENT_TYPE_META[ct].labelKey, { ns: "admin" })}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </label>
            {clientType === "hotel" && (
              <label className="field">
                <span className="flab">{t("newBooking.room", "Chambre")}</span>
                <input
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="1002"
                />
              </label>
            )}
          </div>

          {/* Assigner à un autre thérapeute */}
          <button
            type="button"
            className="quiet-row"
            style={{ margin: 0, width: "100%" }}
            onClick={() => setAssignToOther(!assignToOther)}
          >
            <span className={cn("chk", assignToOther && "on")}>
              {assignToOther && <span style={{ fontSize: 13, lineHeight: 1 }}>✓</span>}
            </span>
            {t("newBooking.assignToOther", "L'associer à un autre thérapeute")}
          </button>
          {assignToOther && (
            <label className="field">
              <span className="flab">{t("newBooking.selectTherapist", "Thérapeute")}</span>
              <div className="sel-wrap">
                <select
                  value={selectedTherapistId}
                  onChange={(e) => setSelectedTherapistId(e.target.value)}
                  disabled={venueTherapistsLoading || venueTherapists.length === 0}
                >
                  <option value="">
                    {venueTherapistsLoading
                      ? t("newBooking.loadingTherapists", "Chargement…")
                      : venueTherapists.length === 0
                        ? t("newBooking.noOtherTherapist", "Aucun autre thérapeute")
                        : t("newBooking.selectTherapist", "Sélectionner un thérapeute")}
                  </option>
                  {venueTherapists.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {[tp.first_name, tp.last_name].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
            </label>
          )}

          {/* Recherche client existant */}
          <div className="search-wrap">
            <Search size={16} />
            <input
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setSelectedCustomerId(null);
              }}
              placeholder={t("newBooking.searchClientPlaceholder", "Rechercher un client existant…")}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Résultats de recherche (hors .form pour un dropdown pleine largeur) */}
        {showResults && (
          <div className="search-results">
            {isSearchingCustomers ? (
              <div className="res" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="mt">{t("newBooking.searching", "Recherche…")}</span>
              </div>
            ) : customerResults.length === 0 ? (
              <div className="res">
                <span className="mt">{t("newBooking.noClientFound", "Aucun client trouvé")}</span>
              </div>
            ) : (
              customerResults.map((c) => (
                <button key={c.id} type="button" className="res" onClick={() => handleSelectCustomer(c)}>
                  <span className="nm">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                  </span>
                  <span className="mt">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="form" style={{ paddingTop: "calc(13px*var(--sp))" }}>
          {/* Prénom / Nom */}
          <div className="frow">
            <label className="field">
              <span className="flab">
                {t("newBooking.firstName", "Prénom")}<em> *</em>
              </span>
              <input
                value={clientFirstName}
                onChange={(e) => setClientFirstName(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span className="flab">
                {t("newBooking.lastName", "Nom")}<em> *</em>
              </span>
              <input
                value={clientLastName}
                onChange={(e) => setClientLastName(e.target.value)}
                autoComplete="off"
              />
            </label>
          </div>

          {/* Téléphone */}
          <label className="field">
            <span className="flab">{t("newBooking.phone", "Téléphone")}</span>
            <div className="tel-field">
              <PhoneNumberField
                value={phone}
                onChange={(val) => setPhone(formatPhoneNumber(val, countryCode))}
                countryCode={countryCode}
                setCountryCode={setCountryCode}
                countries={countries}
                placeholder="6 12 34 56 78"
              />
            </div>
          </label>

          {/* E-mail */}
          <label className="field">
            <span className="flab">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@email.com"
            />
          </label>

          {/* Date & Heure */}
          <div className="frow">
            <div className="field">
              <span className="flab">
                Date<em> *</em>
              </span>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className={cn("selbtn", !selectedDate && "placeholder")}>
                    <span className="flex items-center gap-2">
                      <CalendarIcon size={15} />
                      {selectedDate
                        ? format(selectedDate, "dd/MM/yyyy", { locale: fr })
                        : t("newBooking.chooseDate", "Choisir")}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => {
                      setSelectedDate(d);
                      setCalendarOpen(false);
                    }}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className="pointer-events-auto"
                    locale={fr}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="field">
              <span className="flab">
                {t("newBooking.time", "Heure")}<em> *</em>
              </span>
              <div className="flex gap-1.5">
                <Popover open={hourOpen} onOpenChange={setHourOpen}>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn("selbtn", !selectedTime.split(":")[0] && "placeholder")}>
                      {selectedTime.split(":")[0] || "HH"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[72px] p-0 pointer-events-auto"
                    align="start"
                    onWheelCapture={(e) => e.stopPropagation()}
                    onTouchMoveCapture={(e) => e.stopPropagation()}
                  >
                    <ScrollArea className="h-40 touch-pan-y">
                      <div>
                        {Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, "0")).map((h) => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => {
                              setSelectedTime(`${h}:${selectedTime.split(":")[1] || "00"}`);
                              setHourOpen(false);
                            }}
                            className={cn(
                              "w-full px-3 py-1.5 text-sm text-center",
                              selectedTime.split(":")[0] === h && "bg-muted",
                            )}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
                <Popover open={minuteOpen} onOpenChange={setMinuteOpen}>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn("selbtn", !selectedTime.split(":")[1] && "placeholder")}>
                      {selectedTime.split(":")[1] || "MM"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[72px] p-0 pointer-events-auto"
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
                              setSelectedTime(`${selectedTime.split(":")[0] || "09"}:${m}`);
                              setMinuteOpen(false);
                            }}
                            className={cn(
                              "w-full px-3 py-1.5 text-sm text-center",
                              selectedTime.split(":")[1] === m && "bg-muted",
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

        <div style={{ height: 12 }} />
      </div>

      {/* Footer */}
      <div className="fiche-foot">
        <button type="button" className="btn-primary-lg" onClick={onNext}>
          {t("newBooking.next", "Continuer")}
        </button>
      </div>
    </div>
  );
}
