import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Clock, User, Phone, Euro, Building2, Users } from "lucide-react";
import { formatPrice } from "@/lib/formatPrice";
import { decodeHtmlEntities } from "@/lib/utils";
import type { BookingWithTreatments, Hotel } from "@/hooks/booking";

interface BookingCalendarViewProps {
  weekDays: Date[];
  currentWeekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  getBookingsForDay: (date: Date) => BookingWithTreatments[];
  getBookingPosition: (booking: BookingWithTreatments) => { top: number; height: number };
  getCurrentTimePosition: (date: Date) => { showIndicator: boolean; position: number };
  getStatusColor: (status: string) => string;
  getTranslatedStatus: (status: string) => string;
  getStatusCardColor: (status: string, paymentStatus?: string | null) => string;
  onCalendarClick: (date: Date, time: string) => void;
  onBookingClick: (booking: BookingWithTreatments) => void;
  hours: number[];
  hourHeight: number;
  startHour: number;
  getHotelInfo: (hotelId: string | null) => Hotel | null;
}

export function BookingCalendarView({
  weekDays,
  currentWeekStart,
  onPreviousWeek,
  onNextWeek,
  getBookingsForDay,
  getBookingPosition,
  getCurrentTimePosition,
  getStatusColor,
  getTranslatedStatus,
  getStatusCardColor,
  onCalendarClick,
  onBookingClick,
  hours,
  hourHeight,
  startHour,
  getHotelInfo,
}: BookingCalendarViewProps) {
  return (
    <div className="p-2 md:p-6 flex flex-col h-full overflow-hidden">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-2 flex-shrink-0">
        <Button variant="outline" size="sm" onClick={onPreviousWeek} className="px-2 md:px-3">
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden md:inline ml-1">Précédente</span>
        </Button>
        <h2 className="text-sm md:text-xl font-semibold text-center flex-1">
          {format(currentWeekStart, "d MMM", { locale: fr })} -{" "}
          {format(addDays(currentWeekStart, 6), "d MMM yyyy", { locale: fr })}
        </h2>
        <Button variant="outline" size="sm" onClick={onNextWeek} className="px-2 md:px-3">
          <span className="hidden md:inline mr-1">Suivante</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="w-full -mx-2 md:mx-0 px-2 md:px-0 flex-1 flex flex-col min-h-0">
        <div className="min-w-[600px] md:min-w-0 w-full bg-card rounded-lg border border-border flex flex-col h-full overflow-hidden">
          <div
            className="flex-1 overflow-auto"
            style={{ scrollbarGutter: "stable" }}
          >
            {/* Header with days */}
            <div className="sticky top-0 z-20 grid grid-cols-[60px_repeat(7,1fr)] md:grid-cols-[80px_repeat(7,1fr)] border-b border-border bg-card">
              <div className="p-1 md:p-3 border-r border-border bg-muted">
                <span className="text-[10px] md:text-xs font-medium text-muted-foreground">Heure</span>
              </div>
              {weekDays.map((day) => {
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                return (
                  <div
                    key={day.toISOString()}
                    className={`p-1 md:p-3 text-center border-r border-border last:border-r-0 bg-muted ${
                      isToday ? "ring-1 ring-inset ring-primary/20" : ""
                    }`}
                  >
                    <div className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase">
                      {format(day, "EEE", { locale: fr })}
                    </div>
                    <div className={`text-sm md:text-xl font-bold ${isToday ? "text-primary" : ""}`}>
                      {format(day, "d")}
                    </div>
                    <div className="text-[8px] md:text-[10px] text-muted-foreground">
                      {format(day, "MMM", { locale: fr })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time slots grid */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] md:grid-cols-[80px_repeat(7,1fr)]">
              {/* Hours column */}
              <div className="border-r border-border bg-muted/20 w-[60px] md:w-[80px]">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-border p-1 flex items-start"
                    style={{ height: `${hourHeight}px` }}
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {hour.toString().padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns with grid and positioned events */}
              {weekDays.map((day) => {
                const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                const dayBookings = getBookingsForDay(day);
                const { showIndicator, position: currentTimeTop } = getCurrentTimePosition(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={`relative border-r border-border last:border-r-0 ${isToday ? "bg-primary/[0.02]" : ""}`}
                  >
                    {/* Grid lines for each hour */}
                    {hours.map((hour) => {
                      const hourStr = `${hour.toString().padStart(2, '0')}:00`;
                      return (
                        <div
                          key={hour}
                          className="border-b border-border cursor-pointer hover:bg-muted/30 transition-colors"
                          style={{ height: `${hourHeight}px` }}
                          onClick={() => onCalendarClick(day, hourStr)}
                        />
                      );
                    })}

                    {/* Absolutely positioned bookings */}
                    <TooltipProvider>
                      {dayBookings.map((booking) => {
                        const { top, height } = getBookingPosition(booking);

                        const duration = booking.duration && booking.duration > 0
                          ? booking.duration
                          : (booking.totalDuration && booking.totalDuration > 0
                            ? booking.totalDuration
                            : 60);
                        const treatments = booking.treatments || [];
                        const durationHours = Math.floor(duration / 60);
                        const durationMinutes = duration % 60;
                        const durationFormatted = durationHours > 0
                          ? (durationMinutes > 0 ? `${durationHours}h${durationMinutes}` : `${durationHours}h`)
                          : `${durationMinutes}min`;
                        const totalPrice = booking.total_price && booking.total_price > 0
                          ? booking.total_price
                          : (booking.treatmentsTotalPrice || 0);

                        return (
                          <Tooltip key={booking.id} delayDuration={300}>
                            <TooltipTrigger asChild>
                              <div
                                className={`absolute left-1 right-1 rounded border text-xs cursor-pointer overflow-hidden z-10 ${getStatusCardColor(booking.status, booking.payment_status)}`}
                                style={{
                                  top: `${top}px`,
                                  height: `${height}px`,
                                  minHeight: '20px'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onBookingClick(booking);
                                }}
                              >
                                <div className="p-1 h-full flex flex-col">
                                  <div className="font-bold text-[11px] leading-tight">{booking.booking_time?.substring(0, 5)}</div>
                                  {height >= 32 && (
                                    <div className="truncate text-[8px] opacity-90">{booking.hotel_name}</div>
                                  )}
                                  {height >= 45 && (
                                    <div className="text-[7px] opacity-75">{durationFormatted}</div>
                                  )}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-sm z-50">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold text-sm">
                                    Booking #{booking.booking_id}
                                  </div>
                                  <Badge className={`text-[8px] ${getStatusColor(booking.status)}`}>
                                    {getTranslatedStatus(booking.status)}
                                  </Badge>
                                </div>

                                {booking.hotel_name && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <Building2 className="h-3 w-3" />
                                    <span>{booking.hotel_name}</span>
                                  </div>
                                )}

                                {booking.room_number && (
                                  <div className="text-xs">
                                    Chambre: {decodeHtmlEntities(booking.room_number)}
                                  </div>
                                )}

                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-xs font-medium">
                                    <User className="h-3 w-3" />
                                    <span>{booking.client_first_name} {booking.client_last_name}</span>
                                  </div>
                                  {booking.phone && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Phone className="h-3 w-3" />
                                      <span>{booking.phone}</span>
                                    </div>
                                  )}
                                </div>

                                {booking.therapist_name && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <Users className="h-3 w-3" />
                                    <span>Thérapeute : {booking.therapist_name}</span>
                                  </div>
                                )}

                                <div className="flex items-center gap-2 text-xs">
                                  <Clock className="h-3 w-3" />
                                  <span>Durée: {durationFormatted}</span>
                                </div>

                                {(() => {
                                  const allOnQuote = treatments.length > 0 && treatments.every(
                                    (t) => (!t.price || t.price === 0) && (!t.duration || t.duration === 0)
                                  );

                                  if (allOnQuote) {
                                    return (
                                      <div className="text-xs text-muted-foreground italic">
                                        Sur devis
                                      </div>
                                    );
                                  }

                                  if (treatments.length > 0) {
                                    return (
                                      <div className="space-y-1">
                                        <div className="text-xs font-medium">Traitements:</div>
                                        <ul className="text-xs space-y-1">
                                          {treatments.map((treatment, idx) => {
                                            const tHours = Math.floor((treatment.duration || 0) / 60);
                                            const tMinutes = (treatment.duration || 0) % 60;
                                            const tDurationFormatted = `${tHours.toString().padStart(2, '0')}h${tMinutes.toString().padStart(2, '0')}`;
                                            return (
                                              <li key={idx} className="flex justify-between gap-2">
                                                <span>{treatment.name}</span>
                                                <span className="text-muted-foreground whitespace-nowrap">
                                                  {tDurationFormatted} • {formatPrice(treatment.price || 0, getHotelInfo(booking.hotel_id)?.currency || 'EUR')}
                                                </span>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      </div>
                                    );
                                  }

                                  return null;
                                })()}

                                <div className="flex items-center gap-2 text-xs font-semibold border-t pt-2">
                                  <Euro className="h-3 w-3" />
                                  <span>Total: {formatPrice(totalPrice, getHotelInfo(booking.hotel_id)?.currency || 'EUR')}</span>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </TooltipProvider>

                    {/* Current time indicator */}
                    {showIndicator && (
                      <div
                        className="absolute left-0 right-0 h-0.5 bg-destructive z-20 pointer-events-none"
                        style={{ top: `${currentTimeTop}px` }}
                      >
                        <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-destructive rounded-full"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
