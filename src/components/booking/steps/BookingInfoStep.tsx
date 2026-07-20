import { useState, useCallback, useEffect, useRef } from "react";
import { UseFormReturn } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SelectField } from "@/components/ui/select-field";
import { TimeSelect } from "../TimeSelect";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, CalendarIcon, Check, Clock, Globe, Info, Loader2, Plus, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentOffset } from "@/lib/timezones";
import { countries, formatPhoneNumber, languageFromCountryCode } from "@/lib/phone";
import { BookingFormValues } from "../CreateBookingDialog.schema";
import { usePmsGuestLookup } from "@/hooks/usePmsGuestLookup";
import { toast } from "sonner";
import { BOOKING_CLIENT_TYPES, CLIENT_TYPE_META } from "@/lib/clientTypeMeta";
import { LEGACY_BOOKING_MINUTES, STAFF_BOOKING_MINUTES } from "@/lib/bookingTimeOptions";
import { useTranslation } from "react-i18next";

interface BookingInfoStepProps {
  form: UseFormReturn<BookingFormValues>;
  isAdmin: boolean;
  isConcierge: boolean;
  hotelIds: string[];
  hotels: Array<{ id: string; name: string; timezone?: string | null; currency?: string | null }> | undefined;
  hotelTimezone: string;
  hotelId: string;
  countryCode: string;
  visibleSlots: number;
  setVisibleSlots: React.Dispatch<React.SetStateAction<number>>;
  isBookingOutOfHours?: boolean;
  surchargePercent?: number;
  pmsLookupEnabled?: boolean;
  isSlotAvailable?: (date: Date | undefined, time: string, slotInterval: number) => boolean;
  isAvailabilityLoading?: (date: Date | undefined) => boolean;
  slotInterval?: number;
  cartAvailableDays?: number[] | null;
  /** Staff (admin/concierge) can pick any 5-min slot, ignoring venue slot_interval grid. */
  staffTimePicker?: boolean;
  onValidateAndNext: () => Promise<void>;
  onCancel: () => void;
}

export function BookingInfoStep({
  form,
  isAdmin,
  isConcierge,
  hotelIds,
  hotels,
  hotelTimezone,
  hotelId,
  countryCode,
  visibleSlots,
  setVisibleSlots,
  isBookingOutOfHours,
  surchargePercent,
  pmsLookupEnabled,
  isSlotAvailable,
  isAvailabilityLoading,
  slotInterval = 30,
  cartAvailableDays,
  staffTimePicker = false,
  onValidateAndNext,
  onCancel,
}: BookingInfoStepProps) {
  const minuteOptions = staffTimePicker ? STAFF_BOOKING_MINUTES : LEGACY_BOOKING_MINUTES;
  const { t } = useTranslation('admin');
  const { lookupGuest, guestData, isLoading: isLookingUpGuest } = usePmsGuestLookup(hotelId);
  const clientType = form.watch("clientType");
  const isHotelClient = clientType === "hotel";
  const roomNumberLater = form.watch("roomNumberLater");

  // Champs obligatoires de l'étape 1 : tant qu'ils ne sont pas remplis, le
  // bouton "Suivant" reste désactivé (au lieu d'afficher les erreurs au clic).
  const infoComplete =
    !!form.watch("hotelId") &&
    !!form.watch("date") &&
    !!form.watch("time") &&
    !!form.watch("clientFirstName")?.trim() &&
    !!form.watch("clientLastName")?.trim() &&
    (!isHotelClient || roomNumberLater || !!form.watch("roomNumber")?.trim());

  // Communication language is pre-filled from the phone country code (+33 → fr,
  // otherwise en). Once the operator picks a value manually (or we load it from
  // an existing customer), we stop auto-deriving so their choice sticks.
  const languageManuallySet = useRef(false);
  useEffect(() => {
    if (languageManuallySet.current) return;
    form.setValue("language", languageFromCountryCode(countryCode));
  }, [countryCode, form]);


  const handleRoomLaterChange = (checked: boolean) => {
    form.setValue("roomNumberLater", checked, { shouldDirty: true });
    if (checked) {
      form.setValue("roomNumber", "");
      form.clearErrors("roomNumber");
    }
  };

  const isDayUnavailableForCart = (date: Date) => {
    if (!cartAvailableDays || cartAvailableDays.length === 0) return false;
    return !cartAvailableDays.includes(date.getDay());
  };

  const handleUnavailableDayWarning = (date: Date) => {
    if (isDayUnavailableForCart(date)) {
      toast.warning("Ce soin n'est normalement pas disponible ce jour-là.");
    }
  };

  const handleRoomNumberBlur = useCallback(async (roomNumber: string) => {
    if (!pmsLookupEnabled || !roomNumber || roomNumber.length === 0) return;

    const result = await lookupGuest(roomNumber);
    if (result?.found && result.guest) {
      form.setValue('clientFirstName', result.guest.firstName);
      form.setValue('clientLastName', result.guest.lastName);
      if (result.guest.email) {
        form.setValue('clientEmail', result.guest.email);
      }
      if (result.guest.phone) {
        const matchedCountry = countries.find(c => result.guest!.phone!.startsWith(c.code));
        if (matchedCountry) {
          form.setValue('countryCode', matchedCountry.code);
          const formatted = formatPhoneNumber(result.guest.phone.slice(matchedCountry.code.length), matchedCountry.code);
          form.setValue('phone', formatted);
        } else {
          form.setValue('phone', result.guest.phone);
        }
      }
      toast.success("Client trouvé via le PMS");
    } else if (result && !result.found) {
      toast.info("Aucun client trouvé pour cette chambre");
    }
  }, [pmsLookupEnabled, lookupGuest, form]);

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const trimmedCustomerSearch = customerSearch.trim();
  const isPhoneSearch = /^\+?\d[\d\s]{2,}$/.test(trimmedCustomerSearch);

  const { data: customerResults = [], isFetching: isSearchingCustomers } = useQuery({
    queryKey: ["create-booking-customer-search", trimmedCustomerSearch],
    enabled: trimmedCustomerSearch.length >= 3 && !selectedCustomerId,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select("id, first_name, last_name, phone, email, language, civility, health_notes")
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
      return (data as Array<{ id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; language: string | null; civility: string | null; health_notes: string | null }>) || [];
    },
  });

  const handleSelectCustomer = (c: { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; language: string | null; civility: string | null; health_notes: string | null }) => {
    setSelectedCustomerId(c.id);
    if (c.health_notes) form.setValue("customerNote", c.health_notes);
    if (c.civility === "madame" || c.civility === "monsieur") form.setValue("civility", c.civility);
    if (c.first_name) form.setValue("clientFirstName", c.first_name);
    if (c.last_name) form.setValue("clientLastName", c.last_name);
    if (c.email) form.setValue("clientEmail", c.email);
    if (c.language === "fr" || c.language === "en") {
      languageManuallySet.current = true;
      form.setValue("language", c.language);
    }
    if (c.phone) {
      const sorted = [...countries].sort((a, b) => b.code.length - a.code.length);
      const match = sorted.find((cc) => c.phone!.startsWith(cc.code));
      if (match) {
        form.setValue("countryCode", match.code);
        form.setValue("phone", formatPhoneNumber(c.phone.slice(match.code.length).trim(), match.code));
      } else {
        form.setValue("phone", c.phone);
      }
    }
    setCustomerSearch(`${c.first_name || ""} ${c.last_name || ""}`.trim());
  };

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [slot2CalendarOpen, setSlot2CalendarOpen] = useState(false);
  const [slot3CalendarOpen, setSlot3CalendarOpen] = useState(false);

  const removeSlot = (slotNum: number) => {
    if (slotNum <= 2) {
      form.setValue('slot2Date', undefined);
      form.setValue('slot2Time', '');
    }
    form.setValue('slot3Date', undefined);
    form.setValue('slot3Time', '');
    setVisibleSlots(slotNum - 1);
  };

  const isHourUnavailable = (date: Date | undefined, hour: string) => {
    if (staffTimePicker || !isSlotAvailable) return false;
    return minuteOptions.every(
      m => !isSlotAvailable(date, `${hour}:${m}`, slotInterval)
    );
  };

  const isMinuteUnavailable = (date: Date | undefined, hour: string, minute: string) => {
    if (staffTimePicker || !isSlotAvailable) return false;
    return !isSlotAvailable(date, `${hour}:${minute}`, slotInterval);
  };

  const isSelectedTimeUnavailable = (date: Date | undefined, time: string) => {
    if (staffTimePicker || !isSlotAvailable || !date || !time || !time.includes(':')) return false;
    return !isSlotAvailable(date, time, slotInterval);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto space-y-3 px-4 py-4">
      <div className="grid grid-cols-2 gap-2">
      <FormField
        control={form.control}
        name="hotelId"
        render={({ field }) => {
          const availableHotels = (isConcierge && hotelIds.length > 0
            ? hotels?.filter(hotel => hotelIds.includes(hotel.id))
            : hotels) ?? [];
          return (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">Hôtel *</FormLabel>
              <FormControl>
                <SelectField
                  options={availableHotels.map((hotel) => ({ value: hotel.id, label: hotel.name }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Sélectionner un hôtel"
                  searchPlaceholder="Rechercher un hôtel..."
                  emptyMessage="Aucun hôtel trouvé."
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          );
        }}
      />

      {/* Client type */}
      <FormField
        control={form.control}
        name="clientType"
        render={({ field }) => (
          <FormItem className="space-y-1">
            <FormLabel className="text-xs">{t('bookings.clientType.label')} *</FormLabel>
            <FormControl>
              <SelectField
                options={BOOKING_CLIENT_TYPES.map((ct) => ({
                  value: ct,
                  label: t(CLIENT_TYPE_META[ct].labelKey),
                  icon: <img src={CLIENT_TYPE_META[ct].logo} alt="" className="w-4 h-4 shrink-0" />,
                }))}
                value={field.value}
                onChange={field.onChange}
              />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
        )}
      />
      </div>

      {/* Concierge info banner */}
      {!isAdmin && (
        <div className="flex gap-2 items-start rounded-lg border border-violet-200 bg-violet-50 p-3">
          <Info className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
          <p className="text-xs text-violet-800">
            Cette réservation sera soumise à la confirmation d'un thérapeute. Les thérapeutes disponibles seront notifiés et le premier à valider un créneau confirmera la réservation.
          </p>
        </div>
      )}

      {/* Time slots */}
      <div className={cn(!isAdmin && "space-y-2")}>
        {/* Slot 1 - Preferred */}
        <div className={cn(
          "space-y-1 border rounded-lg p-3",
          !isAdmin ? "border-emerald-200 bg-emerald-50/50" : ""
        )}>
          {!isAdmin && (
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-semibold">1</span>
              <span className="text-xs font-medium text-emerald-700">Créneau préféré</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 items-end">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs">Date *</FormLabel>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full h-9 justify-start text-left font-normal hover:bg-background hover:text-foreground",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "dd/MM/yyyy", { locale: fr }) : <span>Sélectionner</span>}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(selectedDate) => {
                          field.onChange(selectedDate);
                          if (selectedDate) handleUnavailableDayWarning(selectedDate);
                          setCalendarOpen(false);
                        }}
                        modifiers={{ unavailable: isDayUnavailableForCart }}
                        modifiersClassNames={{ unavailable: "line-through text-red-500" }}
                        initialFocus
                        className="pointer-events-auto"
                        locale={fr}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs flex items-center gap-1">
                    Heure *
                    {isAvailabilityLoading?.(form.getValues("date")) && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </FormLabel>
                  <div className="flex gap-1 items-center">
                    <TimeSelect
                      value={field.value}
                      onChange={field.onChange}
                      minuteOptions={minuteOptions}
                      date={form.getValues("date")}
                      isHourUnavailable={isHourUnavailable}
                      isMinuteUnavailable={isMinuteUnavailable}
                    />
                    {hotelId && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                        <Globe className="h-3 w-3 shrink-0" />
                        {getCurrentOffset(hotelTimezone)}
                      </span>
                    )}
                  </div>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          {/* Out-of-hours indicator */}
          {isBookingOutOfHours && (
            <div className="col-span-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Hors horaires d'ouverture — Majoration de {surchargePercent}% appliquée
              </p>
            </div>
          )}

          {/* Unavailable slot warning */}
          {isSelectedTimeUnavailable(form.getValues("date"), form.getValues("time")) && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Ce créneau pourrait ne pas être disponible (conflit salle ou thérapeute)
              </p>
            </div>
          )}
        </div>

        {/* Slot 2 - Alternative 1 (concierge only, dynamic) */}
        {!isAdmin && visibleSlots >= 2 && (
          <div className="space-y-1 border rounded-lg p-3 border-amber-200 bg-amber-50/50 relative">
            <button type="button" onClick={() => removeSlot(2)} className="absolute top-2 right-2 text-amber-400 hover:text-amber-600 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-semibold">2</span>
              <span className="text-xs font-medium text-amber-700">Alternative 1</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="slot2Date"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs">Date</FormLabel>
                    <Popover open={slot2CalendarOpen} onOpenChange={setSlot2CalendarOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal hover:bg-background hover:text-foreground", !field.value && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "dd/MM/yyyy", { locale: fr }) : "Sélectionner"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={(d) => { field.onChange(d); if (d) handleUnavailableDayWarning(d); setSlot2CalendarOpen(false); }} modifiers={{ unavailable: isDayUnavailableForCart }} modifiersClassNames={{ unavailable: "line-through text-red-500" }} initialFocus className="pointer-events-auto" locale={fr} />
                      </PopoverContent>
                    </Popover>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slot2Time"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs flex items-center gap-1">
                      Heure
                      {isAvailabilityLoading?.(form.getValues("slot2Date")) && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </FormLabel>
                    <div className="flex gap-1 items-center">
                      <TimeSelect
                        value={field.value}
                        onChange={field.onChange}
                        minuteOptions={minuteOptions}
                        date={form.getValues("slot2Date")}
                        isHourUnavailable={isHourUnavailable}
                        isMinuteUnavailable={isMinuteUnavailable}
                      />
                    </div>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>
            {isSelectedTimeUnavailable(form.getValues("slot2Date"), form.getValues("slot2Time")) && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Ce créneau pourrait ne pas être disponible
                </p>
              </div>
            )}
          </div>
        )}

        {/* Slot 3 - Alternative 2 (concierge only, dynamic) */}
        {!isAdmin && visibleSlots >= 3 && (
          <div className="space-y-1 border rounded-lg p-3 border-gray-200 bg-gray-50/50 relative">
            <button type="button" onClick={() => removeSlot(3)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-400 text-white text-xs font-semibold">3</span>
              <span className="text-xs font-medium text-gray-500">Alternative 2</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="slot3Date"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs">Date</FormLabel>
                    <Popover open={slot3CalendarOpen} onOpenChange={setSlot3CalendarOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal hover:bg-background hover:text-foreground", !field.value && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "dd/MM/yyyy", { locale: fr }) : "Sélectionner"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={(d) => { field.onChange(d); if (d) handleUnavailableDayWarning(d); setSlot3CalendarOpen(false); }} modifiers={{ unavailable: isDayUnavailableForCart }} modifiersClassNames={{ unavailable: "line-through text-red-500" }} initialFocus className="pointer-events-auto" locale={fr} />
                      </PopoverContent>
                    </Popover>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slot3Time"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs flex items-center gap-1">
                      Heure
                      {isAvailabilityLoading?.(form.getValues("slot3Date")) && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </FormLabel>
                    <div className="flex gap-1 items-center">
                      <TimeSelect
                        value={field.value}
                        onChange={field.onChange}
                        minuteOptions={minuteOptions}
                        date={form.getValues("slot3Date")}
                        isHourUnavailable={isHourUnavailable}
                        isMinuteUnavailable={isMinuteUnavailable}
                      />
                    </div>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>
            {isSelectedTimeUnavailable(form.getValues("slot3Date"), form.getValues("slot3Time")) && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Ce créneau pourrait ne pas être disponible
                </p>
              </div>
            )}
          </div>
        )}

        {/* Add slot button (concierge only) */}
        {!isAdmin && visibleSlots < 3 && (
          <Button
            type="button"
            variant="outline"
            className="w-full h-9 border-dashed text-muted-foreground"
            onClick={() => setVisibleSlots(v => v + 1)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un créneau alternatif
          </Button>
        )}
      </div>

      {/* PMS hint banner + Room number FIRST when PMS enabled (hotel clients only) */}
      {pmsLookupEnabled && isHotelClient && (
        <div className="flex gap-2 items-start rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 dark:text-blue-300">
            Renseignez le numéro de chambre — les informations client seront récupérées automatiquement depuis le PMS.
          </p>
        </div>
      )}
      {pmsLookupEnabled && isHotelClient && (
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="roomNumber"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">
                  N° de chambre {!roomNumberLater && "*"}
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      disabled={roomNumberLater}
                      className="h-9 pr-8"
                      placeholder={roomNumberLater ? "À renseigner plus tard" : "1002"}
                      onBlur={(e) => {
                        field.onBlur();
                        handleRoomNumberBlur(e.target.value);
                      }}
                    />
                    {isLookingUpGuest && (
                      <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {!isLookingUpGuest && guestData?.found && (
                      <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-green-500" />
                    )}
                  </div>
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={roomNumberLater}
              onCheckedChange={(v) => handleRoomLaterChange(v === true)}
            />
            Numéro de chambre à renseigner plus tard (client pas encore arrivé)
          </label>
        </div>
      )}

      {/* Customer search (existing clients) */}
      <div className="relative">
        <Label className="flex items-center gap-1.5 mb-1 text-xs">
          <Search className="h-3.5 w-3.5" />
          Rechercher un client existant
        </Label>
        <Input
          value={customerSearch}
          onChange={(e) => {
            setCustomerSearch(e.target.value);
            setSelectedCustomerId(null);
          }}
          placeholder="Nom, prénom ou téléphone…"
          className="h-9"
        />
        {trimmedCustomerSearch.length >= 3 && !selectedCustomerId && (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg border bg-popover shadow-md">
            {isSearchingCustomers ? (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Recherche…
              </div>
            ) : customerResults.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Aucun client trouvé</div>
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

      <div className="grid grid-cols-2 gap-2">
        <FormField
          control={form.control}
          name="civility"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">
                {t('booking.civility.label')}{' '}
                <span className="text-muted-foreground font-normal">{t('booking.civility.optional')}</span>
              </FormLabel>
              <FormControl>
                <SelectField
                  options={[
                    { value: "madame", label: t('booking.civility.madame') },
                    { value: "monsieur", label: t('booking.civility.monsieur') },
                  ]}
                  value={field.value ?? undefined}
                  onChange={field.onChange}
                  placeholder={t('booking.civility.label')}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="language"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">Langue des messages client (SMS / email)</FormLabel>
              <FormControl>
                <SelectField
                  options={[
                    { value: "fr", label: "🇫🇷 Français" },
                    { value: "en", label: "🇬🇧 English" },
                  ]}
                  value={field.value}
                  onChange={(value) => {
                    languageManuallySet.current = true;
                    field.onChange(value);
                  }}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FormField
          control={form.control}
          name="clientFirstName"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">Prénom *</FormLabel>
              <FormControl>
                <Input {...field} className="h-9" />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="clientLastName"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">Nom *</FormLabel>
              <FormControl>
                <Input {...field} className="h-9" />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </div>

      {/* Email + Phone on one row */}
      <div className="grid grid-cols-2 gap-2">
        <FormField
          control={form.control}
          name="clientEmail"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">
                Email <span className="text-muted-foreground font-normal">(optionnel)</span>
              </FormLabel>
              <FormControl>
                <Input {...field} type="email" className="h-9" placeholder="client@email.com" />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">Phone number</FormLabel>
              <FormControl>
                <PhoneNumberField
                  value={field.value}
                  onChange={(val) => {
                    const formatted = formatPhoneNumber(val, countryCode);
                    field.onChange(formatted);
                  }}
                  countryCode={countryCode}
                  setCountryCode={(code) => form.setValue("countryCode", code)}
                  countries={countries}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </div>

      <div className="grid gap-2 grid-cols-2">
        {/* Room number when PMS disabled and hotel client */}
        {!pmsLookupEnabled && isHotelClient && (
          <div className="space-y-2">
            <FormField
              control={form.control}
              name="roomNumber"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs">
                    N° de chambre {!roomNumberLater && "*"}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        disabled={roomNumberLater}
                        className="h-9 pr-8"
                        placeholder={roomNumberLater ? "À renseigner plus tard" : "1002"}
                        onBlur={(e) => {
                          field.onBlur();
                          handleRoomNumberBlur(e.target.value);
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={roomNumberLater}
                onCheckedChange={(v) => handleRoomLaterChange(v === true)}
              />
              Numéro de chambre à renseigner plus tard (client pas encore arrivé)
            </label>
          </div>
        )}

        <div className="md:col-span-2 grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="clientNote"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" /> Note réservation
                </FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder="Note pour cette réservation…"
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="customerNote"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs flex items-center gap-1">
                  <User className="h-3 w-3" /> Note client
                </FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder="Note permanente (VIP, préférences…), sur toutes ses réservations"
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </div>
      </div>

      </div>

      {/* Footer */}
      <div className="flex justify-between gap-3 px-4 py-3 border-t shrink-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="button" onClick={onValidateAndNext} disabled={!infoComplete}>
          Suivant
        </Button>
      </div>
    </div>
  );
}
