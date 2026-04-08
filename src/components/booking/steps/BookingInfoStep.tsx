import { useState, useCallback } from "react";
import { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, CalendarIcon, Check, ChevronDown, ChevronsUpDown, Clock, Globe, Info, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentOffset } from "@/lib/timezones";
import { countries, formatPhoneNumber } from "@/lib/phone";
import { BookingFormValues } from "../CreateBookingDialog.schema";
import { usePmsGuestLookup } from "@/hooks/usePmsGuestLookup";
import { toast } from "sonner";

interface BookingInfoStepProps {
  form: UseFormReturn<BookingFormValues>;
  isAdmin: boolean;
  isConcierge: boolean;
  hotelIds: string[];
  hotels: Array<{ id: string; name: string; timezone?: string | null; currency?: string | null }> | undefined;
  therapists: Array<{ id: string; first_name: string; last_name: string; status?: string }> | undefined;
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
  onValidateAndNext: () => Promise<void>;
  onCancel: () => void;
}

export function BookingInfoStep({
  form,
  isAdmin,
  isConcierge,
  hotelIds,
  hotels,
  therapists,
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
  onValidateAndNext,
  onCancel,
}: BookingInfoStepProps) {
  const { lookupGuest, guestData, isLoading: isLookingUpGuest } = usePmsGuestLookup(hotelId);

  const handleRoomNumberBlur = useCallback(async (roomNumber: string) => {
    if (!pmsLookupEnabled || !roomNumber || roomNumber.length === 0) return;

    const result = await lookupGuest(roomNumber);
    if (result?.found && result.guest) {
      form.setValue('clientFirstName', result.guest.firstName);
      form.setValue('clientLastName', result.guest.lastName);
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

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [hourOpen, setHourOpen] = useState(false);
  const [minuteOpen, setMinuteOpen] = useState(false);
  const [therapistOpen, setTherapistOpen] = useState(false);
  const [slot2CalendarOpen, setSlot2CalendarOpen] = useState(false);
  const [slot2HourOpen, setSlot2HourOpen] = useState(false);
  const [slot2MinuteOpen, setSlot2MinuteOpen] = useState(false);
  const [slot3CalendarOpen, setSlot3CalendarOpen] = useState(false);
  const [slot3HourOpen, setSlot3HourOpen] = useState(false);
  const [slot3MinuteOpen, setSlot3MinuteOpen] = useState(false);

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
    if (!isSlotAvailable) return false;
    return ['00', '10', '20', '30', '40', '50'].every(
      m => !isSlotAvailable(date, `${hour}:${m}`, slotInterval)
    );
  };

  const isMinuteUnavailable = (date: Date | undefined, hour: string, minute: string) => {
    if (!isSlotAvailable) return false;
    return !isSlotAvailable(date, `${hour}:${minute}`, slotInterval);
  };

  const isSelectedTimeUnavailable = (date: Date | undefined, time: string) => {
    if (!isSlotAvailable || !date || !time || !time.includes(':')) return false;
    return !isSlotAvailable(date, time, slotInterval);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto space-y-3 px-4 py-4">
      <div className={cn("grid gap-2", isAdmin ? "grid-cols-2" : "grid-cols-1")}>
        <FormField
          control={form.control}
          name="hotelId"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">Hôtel *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Sélectionner un hôtel" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(isConcierge && hotelIds.length > 0
                    ? hotels?.filter(hotel => hotelIds.includes(hotel.id))
                    : hotels
                  )?.map((hotel) => (
                    <SelectItem key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        {isAdmin && (
          <FormField
            control={form.control}
            name="therapistId"
            render={({ field }) => {
              const selected = therapists?.find((t) => t.id === field.value);
              return (
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs">Thérapeute / Prestataire *</FormLabel>
                  <Popover open={therapistOpen} onOpenChange={setTherapistOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={therapistOpen}
                          className={cn(
                            "w-full h-9 justify-between font-normal hover:bg-background hover:text-foreground",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {selected
                            ? `${selected.first_name} ${selected.last_name}`
                            : "Sélectionner un thérapeute"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Rechercher un thérapeute..." />
                        <CommandList>
                          <CommandEmpty>Aucun thérapeute trouvé.</CommandEmpty>
                          <CommandGroup>
                            {therapists?.map((therapist) => (
                              <CommandItem
                                key={therapist.id}
                                value={`${therapist.first_name} ${therapist.last_name}`}
                                onSelect={() => {
                                  field.onChange(therapist.id);
                                  setTherapistOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === therapist.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {therapist.first_name} {therapist.last_name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage className="text-xs" />
                </FormItem>
              );
            }}
          />
        )}
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
          <div className="grid grid-cols-2 gap-2">
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
                          setCalendarOpen(false);
                        }}
                        disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
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
                    <Popover open={hourOpen} onOpenChange={setHourOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
                          {field.value.split(':')[0] || "HH"}
                          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start" onWheelCapture={(e) => e.stopPropagation()} onTouchMoveCapture={(e) => e.stopPropagation()}>
                        <ScrollArea className="h-40 touch-pan-y">
                          <div>
                            {Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, '0')).map(h => (
                              <button
                                key={h}
                                type="button"
                                onClick={() => {
                                  field.onChange(`${h}:${field.value.split(':')[1] || '00'}`);
                                  setHourOpen(false);
                                }}
                                className={cn(
                                  "w-full px-3 py-1.5 text-sm text-center",
                                  field.value.split(':')[0] === h && "bg-muted",
                                  isHourUnavailable(form.getValues("date"), h) && "opacity-40 text-muted-foreground"
                                )}
                              >
                                {h}
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                    <span className="flex items-center text-muted-foreground">:</span>
                    <Popover open={minuteOpen} onOpenChange={setMinuteOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
                          {field.value.split(':')[1] || "MM"}
                          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start" onWheelCapture={(e) => e.stopPropagation()} onTouchMoveCapture={(e) => e.stopPropagation()}>
                        <ScrollArea className="h-40 touch-pan-y">
                          <div>
                            {['00', '10', '20', '30', '40', '50'].map(m => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => {
                                  field.onChange(`${field.value.split(':')[0] || '09'}:${m}`);
                                  setMinuteOpen(false);
                                }}
                                className={cn(
                                  "w-full px-3 py-1.5 text-sm text-center",
                                  field.value.split(':')[1] === m && "bg-muted",
                                  isMinuteUnavailable(form.getValues("date"), field.value.split(':')[0] || '09', m) && "opacity-40 text-muted-foreground"
                                )}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
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
                        <Calendar mode="single" selected={field.value} onSelect={(d) => { field.onChange(d); setSlot2CalendarOpen(false); }} disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))} initialFocus className="pointer-events-auto" locale={fr} />
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
                      <Popover open={slot2HourOpen} onOpenChange={setSlot2HourOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
                            {field.value?.split(':')[0] || "HH"}
                            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start">
                          <ScrollArea className="h-40 touch-pan-y">
                            <div>
                              {Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, '0')).map(h => (
                                <button key={h} type="button" onClick={() => { field.onChange(`${h}:${field.value?.split(':')[1] || '00'}`); setSlot2HourOpen(false); }} className={cn("w-full px-3 py-1.5 text-sm text-center", field.value?.split(':')[0] === h && "bg-muted", isHourUnavailable(form.getValues("slot2Date"), h) && "opacity-40 text-muted-foreground")}>{h}</button>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
                      <span className="flex items-center text-muted-foreground">:</span>
                      <Popover open={slot2MinuteOpen} onOpenChange={setSlot2MinuteOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
                            {field.value?.split(':')[1] || "MM"}
                            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start">
                          <ScrollArea className="h-40 touch-pan-y">
                            <div>
                              {['00','10','20','30','40','50'].map(m => (
                                <button key={m} type="button" onClick={() => { field.onChange(`${field.value?.split(':')[0] || '09'}:${m}`); setSlot2MinuteOpen(false); }} className={cn("w-full px-3 py-1.5 text-sm text-center", field.value?.split(':')[1] === m && "bg-muted", isMinuteUnavailable(form.getValues("slot2Date"), field.value?.split(':')[0] || '09', m) && "opacity-40 text-muted-foreground")}>{m}</button>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
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
                        <Calendar mode="single" selected={field.value} onSelect={(d) => { field.onChange(d); setSlot3CalendarOpen(false); }} disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))} initialFocus className="pointer-events-auto" locale={fr} />
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
                      <Popover open={slot3HourOpen} onOpenChange={setSlot3HourOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
                            {field.value?.split(':')[0] || "HH"}
                            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start">
                          <ScrollArea className="h-40 touch-pan-y">
                            <div>
                              {Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, '0')).map(h => (
                                <button key={h} type="button" onClick={() => { field.onChange(`${h}:${field.value?.split(':')[1] || '00'}`); setSlot3HourOpen(false); }} className={cn("w-full px-3 py-1.5 text-sm text-center", field.value?.split(':')[0] === h && "bg-muted", isHourUnavailable(form.getValues("slot3Date"), h) && "opacity-40 text-muted-foreground")}>{h}</button>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
                      <span className="flex items-center text-muted-foreground">:</span>
                      <Popover open={slot3MinuteOpen} onOpenChange={setSlot3MinuteOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-9 w-[72px] justify-between font-normal hover:bg-background hover:text-foreground">
                            {field.value?.split(':')[1] || "MM"}
                            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[68px] p-0 pointer-events-auto" align="start">
                          <ScrollArea className="h-40 touch-pan-y">
                            <div>
                              {['00','10','20','30','40','50'].map(m => (
                                <button key={m} type="button" onClick={() => { field.onChange(`${field.value?.split(':')[0] || '09'}:${m}`); setSlot3MinuteOpen(false); }} className={cn("w-full px-3 py-1.5 text-sm text-center", field.value?.split(':')[1] === m && "bg-muted", isMinuteUnavailable(form.getValues("slot3Date"), field.value?.split(':')[0] || '09', m) && "opacity-40 text-muted-foreground")}>{m}</button>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
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

      {/* PMS hint banner + Room number FIRST when PMS enabled */}
      {pmsLookupEnabled && (
        <div className="flex gap-2 items-start rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 dark:text-blue-300">
            Renseignez le numéro de chambre — les informations client seront récupérées automatiquement depuis le PMS.
          </p>
        </div>
      )}
      {pmsLookupEnabled && (
        <FormField
          control={form.control}
          name="roomNumber"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">Room number</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    {...field}
                    className="h-9 pr-8"
                    placeholder="1002"
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
      )}

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

      <div className={cn("grid gap-2", pmsLookupEnabled ? "grid-cols-1" : "grid-cols-2")}>
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">Phone number *</FormLabel>
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

        {/* Room number AFTER phone when PMS disabled */}
        {!pmsLookupEnabled && (
          <FormField
            control={form.control}
            name="roomNumber"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">Room number</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      className="h-9 pr-8"
                      placeholder="1002"
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
        )}
      </div>

      </div>

      {/* Footer */}
      <div className="flex justify-between gap-3 px-4 py-3 border-t shrink-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="button" onClick={onValidateAndNext}>
          Suivant
        </Button>
      </div>
    </div>
  );
}
