import { useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, ChevronDown, Globe, Info, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentOffset } from "@/lib/timezones";
import { countries, formatPhoneNumber } from "@/lib/phone";
import { BookingFormValues } from "../CreateBookingDialog.schema";

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
  onValidateAndNext,
  onCancel,
}: BookingInfoStepProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [hourOpen, setHourOpen] = useState(false);
  const [minuteOpen, setMinuteOpen] = useState(false);
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
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">Thérapeute / Prestataire *</FormLabel>
                <Select
                  value={field.value || "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                >
                  <FormControl>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sélectionner un thérapeute" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-background border shadow-lg">
                    {therapists?.map((therapist) => (
                      <SelectItem key={therapist.id} value={therapist.id}>
                        {therapist.first_name} {therapist.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
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
                  <FormLabel className="text-xs">Heure *</FormLabel>
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
                                  field.value.split(':')[0] === h && "bg-muted"
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
                                  field.value.split(':')[1] === m && "bg-muted"
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
                    <FormLabel className="text-xs">Heure</FormLabel>
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
                                <button key={h} type="button" onClick={() => { field.onChange(`${h}:${field.value?.split(':')[1] || '00'}`); setSlot2HourOpen(false); }} className={cn("w-full px-3 py-1.5 text-sm text-center", field.value?.split(':')[0] === h && "bg-muted")}>{h}</button>
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
                                <button key={m} type="button" onClick={() => { field.onChange(`${field.value?.split(':')[0] || '09'}:${m}`); setSlot2MinuteOpen(false); }} className={cn("w-full px-3 py-1.5 text-sm text-center", field.value?.split(':')[1] === m && "bg-muted")}>{m}</button>
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
                    <FormLabel className="text-xs">Heure</FormLabel>
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
                                <button key={h} type="button" onClick={() => { field.onChange(`${h}:${field.value?.split(':')[1] || '00'}`); setSlot3HourOpen(false); }} className={cn("w-full px-3 py-1.5 text-sm text-center", field.value?.split(':')[0] === h && "bg-muted")}>{h}</button>
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
                                <button key={m} type="button" onClick={() => { field.onChange(`${field.value?.split(':')[0] || '09'}:${m}`); setSlot3MinuteOpen(false); }} className={cn("w-full px-3 py-1.5 text-sm text-center", field.value?.split(':')[1] === m && "bg-muted")}>{m}</button>
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

      <div className="grid grid-cols-2 gap-2">
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

        <FormField
          control={form.control}
          name="roomNumber"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">Room number</FormLabel>
              <FormControl>
                <Input {...field} className="h-9" placeholder="1002" />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
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
