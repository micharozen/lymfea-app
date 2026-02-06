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
import { CalendarIcon, ChevronDown, Globe } from "lucide-react";
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
  hairdressers: Array<{ id: string; first_name: string; last_name: string; status?: string }> | undefined;
  hotelTimezone: string;
  hotelId: string;
  countryCode: string;
  onValidateAndNext: () => Promise<void>;
  onCancel: () => void;
}

export function BookingInfoStep({
  form,
  isAdmin,
  isConcierge,
  hotelIds,
  hotels,
  hairdressers,
  hotelTimezone,
  hotelId,
  countryCode,
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

  return (
    <>
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
            name="hairdresserId"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">Coiffeur / Prestataire *</FormLabel>
                <Select
                  value={field.value || "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                >
                  <FormControl>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sélectionner un coiffeur" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-background border shadow-lg">
                    {hairdressers?.map((hairdresser) => (
                      <SelectItem key={hairdresser.id} value={hairdresser.id}>
                        {hairdresser.first_name} {hairdresser.last_name}
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

      {/* Alternative slots - Concierge only */}
      {!isAdmin && (
        <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground">Créneaux alternatifs (optionnel)</p>

          {/* Slot 2 */}
          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="slot2Date"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[10px] text-muted-foreground">Créneau 2 - Date</FormLabel>
                  <Popover open={slot2CalendarOpen} onOpenChange={setSlot2CalendarOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className={cn("w-full h-8 justify-start text-left font-normal text-xs hover:bg-background hover:text-foreground", !field.value && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-3 w-3" />
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
                  <FormLabel className="text-[10px] text-muted-foreground">Créneau 2 - Heure</FormLabel>
                  <div className="flex gap-1 items-center">
                    <Popover open={slot2HourOpen} onOpenChange={setSlot2HourOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-8 w-[60px] justify-between font-normal text-xs hover:bg-background hover:text-foreground">
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
                    <span className="text-muted-foreground text-xs">:</span>
                    <Popover open={slot2MinuteOpen} onOpenChange={setSlot2MinuteOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-8 w-[60px] justify-between font-normal text-xs hover:bg-background hover:text-foreground">
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

          {/* Slot 3 */}
          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="slot3Date"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[10px] text-muted-foreground">Créneau 3 - Date</FormLabel>
                  <Popover open={slot3CalendarOpen} onOpenChange={setSlot3CalendarOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className={cn("w-full h-8 justify-start text-left font-normal text-xs hover:bg-background hover:text-foreground", !field.value && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-3 w-3" />
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
                  <FormLabel className="text-[10px] text-muted-foreground">Créneau 3 - Heure</FormLabel>
                  <div className="flex gap-1 items-center">
                    <Popover open={slot3HourOpen} onOpenChange={setSlot3HourOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-8 w-[60px] justify-between font-normal text-xs hover:bg-background hover:text-foreground">
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
                    <span className="text-muted-foreground text-xs">:</span>
                    <Popover open={slot3MinuteOpen} onOpenChange={setSlot3MinuteOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-8 w-[60px] justify-between font-normal text-xs hover:bg-background hover:text-foreground">
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

      {/* Footer */}
      <div className="flex justify-between gap-3 pt-4 mt-4 border-t shrink-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="button" onClick={onValidateAndNext}>
          Suivant
        </Button>
      </div>
    </>
  );
}
