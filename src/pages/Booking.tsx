import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIcon, List, Search, ChevronLeft, ChevronRight, Clock, User, Phone, Euro, Building2, Users, FileText, Download, CreditCard, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CreateBookingDialog from "@/components/CreateBookingDialog";
import EditBookingDialog from "@/components/EditBookingDialog";

import { StatusBadge } from "@/components/StatusBadge";
import { getBookingStatusConfig, getPaymentStatusConfig } from "@/utils/statusStyles";
import { useUserContext } from "@/hooks/useUserContext";
import { format, addDays, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";

export default function Booking() {
  const { isAdmin } = useUserContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [hairdresserFilter, setHairdresserFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>();
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [invoiceHTML, setInvoiceHTML] = useState("");
  const [invoiceBookingId, setInvoiceBookingId] = useState<number | null>(null);
  const [hasOpenedFromUrl, setHasOpenedFromUrl] = useState(false);



  const { data: bookings } = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const { data: bookingsData, error: bookingsError } = await supabase
        .from("bookings")
        .select("*")
        .order("booking_date", { ascending: true })
        .order("booking_time", { ascending: true });

      if (bookingsError) throw bookingsError;

      // Fetch treatments for each booking
      const bookingsWithDuration = await Promise.all(
        (bookingsData || []).map(async (booking) => {
          const { data: treatments } = await supabase
            .from("booking_treatments")
            .select(`
              treatment_id,
              treatment_menus (
                name,
                duration,
                price
              )
            `)
            .eq("booking_id", booking.id);

          const totalDuration = treatments?.reduce((sum, t: any) => {
            return sum + (t.treatment_menus?.duration || 0);
          }, 0) || 0;
          
          const totalPrice = treatments?.reduce((sum, t: any) => {
            return sum + (t.treatment_menus?.price || 0);
          }, 0) || 0;

          return {
            ...booking,
            totalDuration,
            total_price: totalPrice,
            treatments: treatments?.map((t: any) => t.treatment_menus).filter(Boolean) || [],
          };
        })
      );

      return bookingsWithDuration;
    },
  });

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: hairdressers } = useQuery({
    queryKey: ["hairdressers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hairdressers")
        .select("id, first_name, last_name")
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Update selectedBooking when bookings data changes
  useEffect(() => {
    if (selectedBooking && bookings) {
      const updatedBooking = bookings.find(b => b.id === selectedBooking.id);
      if (updatedBooking && JSON.stringify(updatedBooking) !== JSON.stringify(selectedBooking)) {
        setSelectedBooking(updatedBooking);
      }
    }
  }, [bookings, selectedBooking]);

  // Open booking from URL parameter (from email link)
  useEffect(() => {
    if (hasOpenedFromUrl || !bookings) return;
    
    const bookingIdFromUrl = searchParams.get('bookingId');
    if (bookingIdFromUrl) {
      const booking = bookings.find(b => b.id === bookingIdFromUrl);
      if (booking) {
        setSelectedBooking(booking);
        setIsEditDialogOpen(true);
        setHasOpenedFromUrl(true);
        // Clear the URL parameter
        setSearchParams({}, { replace: true });
      }
    }
  }, [bookings, searchParams, hasOpenedFromUrl, setSearchParams]);

  // Generate hourly slots from 07:00 to 21:00 for main display (working hours only)
  const START_HOUR = 7;
  const END_HOUR = 22;
  const HOUR_HEIGHT = 48; // pixels per hour - compact view
  
  const hours = useMemo(() => {
    return Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR); // 7 to 21
  }, []);

  // Generate 10-minute time slots for booking selection (24h)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 0; hour <= 23; hour++) {
      for (let minute = 0; minute < 60; minute += 10) {
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }, []);

  const filteredBookings = bookings?.filter((booking) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      booking.client_first_name?.toLowerCase().includes(searchLower) ||
      booking.client_last_name?.toLowerCase().includes(searchLower) ||
      booking.phone?.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilter === "all" || booking.status === statusFilter;
    const matchesHotel = hotelFilter === "all" || booking.hotel_id === hotelFilter;
    const matchesHairdresser =
      hairdresserFilter === "all" || booking.hairdresser_id === hairdresserFilter;

    return matchesSearch && matchesStatus && matchesHotel && matchesHairdresser;
  });

  const handleCalendarClick = (date: Date, time: string) => {
    setSelectedDate(date);
    setSelectedTime(time);
    setIsCreateDialogOpen(true);
  };

  const handlePreviousWeek = () => {
    setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  // Get all bookings for a specific day that fall within visible hours
  const getBookingsForDay = (date: Date) => {
    return filteredBookings?.filter((booking) => {
      const bookingDate = booking.booking_date === format(date, "yyyy-MM-dd");
      if (!bookingDate || !booking.booking_time) return false;
      
      const [hours] = booking.booking_time.split(':').map(Number);
      return hours >= START_HOUR && hours < END_HOUR;
    }) || [];
  };

  // Calculate precise position and height for a booking
  const getBookingPosition = (booking: any) => {
    if (!booking.booking_time) return { top: 0, height: HOUR_HEIGHT };
    
    const [hours, minutes] = booking.booking_time.split(':').map(Number);
    const duration = (booking as any).totalDuration || 60; // default 60 min if no duration
    
    // Calculate top position in pixels from start of grid
    const totalMinutesFromStart = (hours - START_HOUR) * 60 + minutes;
    const top = (totalMinutesFromStart / 60) * HOUR_HEIGHT;
    
    // Calculate height based on duration
    const height = (duration / 60) * HOUR_HEIGHT;
    
    return { top, height: Math.max(height, 20) }; // minimum 20px height for visibility
  };

  const isCurrentHour = (date: Date, hour: number) => {
    if (format(date, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd")) return false;
    const now = new Date(currentTime.toLocaleString("en-US", { timeZone: timezone }));
    return now.getHours() === hour;
  };

  // Use centralized status config
  const getStatusColor = (status: string) => {
    return getBookingStatusConfig(status).badgeClass;
  };

  const getTranslatedStatus = (status: string) => {
    return getBookingStatusConfig(status).label;
  };

  const getStatusCardColor = (status: string, paymentStatus?: string | null) => {
    if (paymentStatus === 'pending' && status !== 'cancelled') {
      return getPaymentStatusConfig('pending').cardClass;
    }
    return getBookingStatusConfig(status).cardClass;
  };

  const getCombinedStatusLabel = (status: string, paymentStatus?: string | null) => {
    if (paymentStatus === 'pending' && status !== 'cancelled') {
      return "€ Paiement";
    }
    return getBookingStatusConfig(status).label;
  };

  const getPaymentStatusBadge = (paymentStatus?: string | null) => {
    if (!paymentStatus) return { label: '-', className: 'bg-muted/50 text-muted-foreground' };
    const config = getPaymentStatusConfig(paymentStatus);
    return { label: config.label, className: config.badgeClass };
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full p-3 md:p-4">
        <div className="mb-2 flex flex-col md:flex-row md:items-center justify-between gap-2 flex-shrink-0">
          <h1 className="text-xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            📅 Réservations
          </h1>
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-4">
            <div className="hidden md:flex items-center gap-2">
              <Label>Fuseau horaire:</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Europe/Paris">Europe/Paris (GMT+1)</SelectItem>
                  <SelectItem value="America/New_York">America/New_York (GMT-5)</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los_Angeles (GMT-8)</SelectItem>
                  <SelectItem value="Asia/Dubai">Asia/Dubai (GMT+4)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo (GMT+9)</SelectItem>
                  <SelectItem value="Australia/Sydney">Australia/Sydney (GMT+11)</SelectItem>
                  <SelectItem value="UTC">UTC (GMT+0)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setIsCreateDialogOpen(true)} className="w-full md:w-auto">
              <Plus className="h-4 w-4 md:hidden" />
              <span className="hidden md:inline">Créer une réservation</span>
              <span className="md:hidden">Nouvelle réservation</span>
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-2 md:p-3 border-b border-border flex-shrink-0">
            <div className="flex flex-col md:flex-row gap-2 md:gap-4 items-stretch md:items-center justify-between">
              <div className="flex flex-col md:flex-row gap-2 md:gap-4 items-stretch md:items-center flex-1">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="grid grid-cols-2 md:flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full md:w-[140px]">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="assigned">Assigné</SelectItem>
                      <SelectItem value="confirmed">Confirmé</SelectItem>
                      <SelectItem value="completed">Terminé</SelectItem>
                      <SelectItem value="cancelled">Annulé</SelectItem>
                    </SelectContent>
                  </Select>

                  {isAdmin && (
                    <Select value={hotelFilter} onValueChange={setHotelFilter}>
                      <SelectTrigger className="w-full md:w-[140px]">
                        <SelectValue placeholder="Hôtel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous</SelectItem>
                        {hotels?.map((hotel) => (
                          <SelectItem key={hotel.id} value={hotel.id}>
                            {hotel.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Select value={hairdresserFilter} onValueChange={setHairdresserFilter}>
                    <SelectTrigger className="w-full md:w-[140px] col-span-2 md:col-span-1">
                      <SelectValue placeholder="Coiffeur" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      {hairdressers?.map((hairdresser) => (
                        <SelectItem key={hairdresser.id} value={hairdresser.id}>
                          {hairdresser.first_name} {hairdresser.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2 justify-center">
                <Button
                  variant={view === "calendar" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setView("calendar")}
                  className="flex-1 md:flex-initial"
                >
                  <CalendarIcon className="h-4 w-4" />
                  <span className="hidden md:inline ml-1">Calendrier</span>
                </Button>
                <Button
                  variant={view === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setView("list")}
                  className="flex-1 md:flex-initial"
                >
                  <List className="h-4 w-4" />
                  <span className="hidden md:inline ml-1">Liste</span>
                </Button>
              </div>
            </div>
          </div>

          {view === "calendar" ? (
            <div className="p-2 md:p-6 overflow-x-auto">
              <div className="flex items-center justify-between mb-4 md:mb-6 gap-2">
                <Button variant="outline" size="sm" onClick={handlePreviousWeek} className="px-2 md:px-3">
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden md:inline ml-1">Précédente</span>
                </Button>
                <h2 className="text-sm md:text-xl font-semibold text-center flex-1">
                  {format(currentWeekStart, "d MMM", { locale: fr })} -{" "}
                  {format(addDays(currentWeekStart, 6), "d MMM yyyy", { locale: fr })}
                </h2>
                <Button variant="outline" size="sm" onClick={handleNextWeek} className="px-2 md:px-3">
                  <span className="hidden md:inline mr-1">Suivante</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="w-full overflow-x-auto -mx-2 md:mx-0 px-2 md:px-0">
                <div className="min-w-[600px] md:min-w-0 w-full bg-card rounded-lg border border-border">
                  {/* Header avec les jours */}
                  <div className="grid grid-cols-8 border-b border-border sticky top-0 bg-card z-10">
                    <div className="p-1 md:p-3 border-r border-border bg-muted/30">
                      <span className="text-[10px] md:text-xs font-medium text-muted-foreground">Heure</span>
                    </div>
                    {weekDays.map((day) => {
                      const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                      return (
                        <div
                          key={day.toISOString()}
                          className={`p-1 md:p-3 text-center border-r border-border last:border-r-0 ${
                            isToday ? "bg-primary/5" : "bg-muted/30"
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

                  {/* Grille avec les créneaux horaires - Nouvelle structure avec positionnement absolu */}
                  <div className="grid grid-cols-8">
                    {/* Colonne des heures */}
                    <div className="border-r border-border bg-muted/20">
                      {hours.map((hour) => (
                        <div
                          key={hour}
                          className="border-b border-border p-1 flex items-start"
                          style={{ height: `${HOUR_HEIGHT}px` }}
                        >
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {hour.toString().padStart(2, '0')}:00
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Colonnes des jours avec grille et événements positionnés */}
                    {weekDays.map((day, dayIndex) => {
                      const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                      const dayBookings = getBookingsForDay(day);
                      
                      // Calculate current time indicator position
                      const now = new Date(currentTime.toLocaleString("en-US", { timeZone: timezone }));
                      const currentHour = now.getHours();
                      const currentMinute = now.getMinutes();
                      const showCurrentTimeIndicator = isToday && currentHour >= START_HOUR && currentHour < END_HOUR;
                      const currentTimeTop = showCurrentTimeIndicator 
                        ? ((currentHour - START_HOUR) * 60 + currentMinute) / 60 * HOUR_HEIGHT
                        : 0;
                      
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
                                style={{ height: `${HOUR_HEIGHT}px` }}
                                onClick={() => handleCalendarClick(day, hourStr)}
                              />
                            );
                          })}
                          
                          {/* Absolutely positioned bookings */}
                          <TooltipProvider>
                            {dayBookings.map((booking) => {
                              const { top, height } = getBookingPosition(booking);
                              const duration = (booking as any).totalDuration || 0;
                              const treatments = (booking as any).treatments || [];
                              const durationHours = Math.floor(duration / 60);
                              const durationMinutes = duration % 60;
                              const durationFormatted = durationHours > 0 
                                ? (durationMinutes > 0 ? `${durationHours}h${durationMinutes}` : `${durationHours}h`)
                                : `${durationMinutes}min`;
                              
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
                                        setSelectedBooking(booking);
                                        setIsEditDialogOpen(true);
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
                                          Chambre: {booking.room_number}
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
                                      
                                      {booking.hairdresser_name && (
                                        <div className="flex items-center gap-2 text-xs">
                                          <Users className="h-3 w-3" />
                                          <span>Coiffeur: {booking.hairdresser_name}</span>
                                        </div>
                                      )}
                                      
                                      <div className="flex items-center gap-2 text-xs">
                                        <Clock className="h-3 w-3" />
                                        <span>Durée: {durationFormatted}</span>
                                      </div>
                                      
                                      {treatments.length > 0 && (
                                        <div className="space-y-1">
                                          <div className="text-xs font-medium">Traitements:</div>
                                          <ul className="text-xs space-y-1">
                                            {treatments.map((treatment: any, idx: number) => {
                                              const tHours = Math.floor(treatment.duration / 60);
                                              const tMinutes = treatment.duration % 60;
                                              const tDurationFormatted = `${tHours.toString().padStart(2, '0')}h${tMinutes.toString().padStart(2, '0')}`;
                                              return (
                                                <li key={idx} className="flex justify-between gap-2">
                                                  <span>{treatment.name}</span>
                                                  <span className="text-muted-foreground whitespace-nowrap">
                                                    {tDurationFormatted} • €{treatment.price}
                                                  </span>
                                                </li>
                                              );
                                            })}
                                          </ul>
                                        </div>
                                      )}
                                      
                                      {booking.total_price && (
                                        <div className="flex items-center gap-2 text-xs font-semibold border-t pt-2">
                                          <Euro className="h-3 w-3" />
                                          <span>Total: €{booking.total_price}</span>
                                        </div>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </TooltipProvider>
                          
                          {/* Current time indicator */}
                          {showCurrentTimeIndicator && (
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
          ) : (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white dark:bg-card">
              <div className="flex-1 overflow-auto">
                <Table className="text-[13px] w-full table-fixed">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="border-b bg-gray-50 dark:bg-muted/30 h-10">
                      <TableHead className="text-[10px] uppercase font-semibold text-muted-foreground py-1 px-3 w-[70px] whitespace-nowrap">Booking ID</TableHead>
                      <TableHead className="text-[10px] uppercase font-semibold text-muted-foreground py-1 px-3 w-[90px] whitespace-nowrap">Date</TableHead>
                      <TableHead className="text-[10px] uppercase font-semibold text-muted-foreground py-1 px-3 w-[70px] whitespace-nowrap">Start time</TableHead>
                      <TableHead className="text-[10px] uppercase font-semibold text-muted-foreground py-1 px-3 w-[90px] whitespace-nowrap">Status</TableHead>
                      <TableHead className="text-[10px] uppercase font-semibold text-muted-foreground py-1 px-3 whitespace-nowrap">Client name</TableHead>
                      <TableHead className="text-[10px] uppercase font-semibold text-muted-foreground py-1 px-3 w-[120px] whitespace-nowrap">Client phone</TableHead>
                      <TableHead className="text-[10px] uppercase font-semibold text-muted-foreground py-1 px-3 w-[80px] whitespace-nowrap">Total price</TableHead>
                      <TableHead className="text-[10px] uppercase font-semibold text-muted-foreground py-1 px-3 whitespace-nowrap">Hotel</TableHead>
                      <TableHead className="text-[10px] uppercase font-semibold text-muted-foreground py-1 px-3 whitespace-nowrap">Hair dresser</TableHead>
                      <TableHead className="text-[10px] uppercase font-semibold text-muted-foreground py-1 px-3 w-[100px] whitespace-nowrap">Invoice</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {filteredBookings
                    ?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((booking) => (
                    <TableRow 
                      key={booking.id}
                      className="cursor-pointer border-b hover:bg-gray-50 dark:hover:bg-muted/30 transition-colors h-11"
                      onClick={() => {
                        setSelectedBooking(booking);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <TableCell className="font-medium py-1 px-3 whitespace-nowrap">#{booking.booking_id}</TableCell>
                      <TableCell className="text-foreground py-1 px-3 whitespace-nowrap">
                        {format(new Date(booking.booking_date), "dd-MM-yyyy")}
                      </TableCell>
                      <TableCell className="text-foreground py-1 px-3 whitespace-nowrap">
                        {booking.booking_time.substring(0, 5).replace(':', ':')}
                        {parseInt(booking.booking_time.substring(0, 2)) >= 12 ? 'PM' : 'AM'}
                      </TableCell>
                      <TableCell className="py-1 px-3">
                        <Badge className={`${getStatusColor(booking.status)} h-6 text-xs px-3 font-medium`}>
                          {getTranslatedStatus(booking.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium py-1 px-3 whitespace-nowrap">
                        {booking.client_first_name} {booking.client_last_name}
                      </TableCell>
                      <TableCell className="text-foreground py-1 px-3 whitespace-nowrap">
                        {booking.phone || "-"}
                      </TableCell>
                      <TableCell className="font-medium py-1 px-3 whitespace-nowrap">€{booking.total_price?.toFixed(2) || "0.00"}</TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TableCell className="text-foreground py-1 px-3 truncate max-w-[150px]">{booking.hotel_name || "-"}</TableCell>
                          </TooltipTrigger>
                          <TooltipContent>{booking.hotel_name || "-"}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TableCell className="text-foreground py-1 px-3 whitespace-nowrap truncate">{booking.hairdresser_name || "-"}</TableCell>
                      <TableCell className="py-1 px-3">
                        {booking.stripe_invoice_url ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-3 font-normal"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(booking.stripe_invoice_url, '_blank');
                            }}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            View invoice
                          </Button>
                        ) : (
                          (booking.payment_status === 'paid' || booking.status === 'completed') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-3 font-normal"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const { data, error } = await supabase.functions.invoke('generate-invoice', {
                                    body: { bookingId: booking.id }
                                  });

                                  if (error) throw error;

                                  setInvoiceHTML(data.html);
                                  setInvoiceBookingId(data.bookingId);
                                  setIsInvoicePreviewOpen(true);
                                } catch (error) {
                                  console.error('Error generating invoice:', error);
                                }
                              }}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1.5" />
                              View invoice
                            </Button>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredBookings?.length && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Aucune réservation trouvée
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t flex-shrink-0 bg-white dark:bg-card">
                <div className="text-sm text-muted-foreground">
                  Display from {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredBookings?.length || 0)} on {filteredBookings?.length || 0} entries
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="text-muted-foreground h-8"
                  >
                    Previous
                  </Button>
                  {filteredBookings && Array.from({ length: Math.ceil(filteredBookings.length / itemsPerPage) }, (_, i) => i + 1)
                    .slice(0, 5)
                    .map((page) => (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="h-8 w-8 p-0"
                      >
                        {page}
                      </Button>
                    ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil((filteredBookings?.length || 0) / itemsPerPage), p + 1))}
                    disabled={!filteredBookings || currentPage === Math.ceil(filteredBookings.length / itemsPerPage)}
                    className="text-muted-foreground h-8"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>


      <CreateBookingDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
      />

      <EditBookingDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        booking={selectedBooking}
      />

      <Dialog open={isInvoicePreviewOpen} onOpenChange={setIsInvoicePreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Aperçu de la facture #{invoiceBookingId}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-lg bg-white">
            <div dangerouslySetInnerHTML={{ __html: invoiceHTML }} />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsInvoicePreviewOpen(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={async () => {
                try {
                  const html2pdf = (await import('html2pdf.js')).default;
                  
                  const element = document.createElement('div');
                  element.innerHTML = invoiceHTML;
                  document.body.appendChild(element);

                  html2pdf()
                    .set({
                      margin: 0,
                      filename: `invoice-${invoiceBookingId}.pdf`,
                      image: { type: 'jpeg', quality: 0.98 },
                      html2canvas: { scale: 2, letterRendering: true },
                      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    })
                    .from(element)
                    .save()
                    .then(() => {
                      document.body.removeChild(element);
                      setIsInvoicePreviewOpen(false);
                    });
                } catch (error) {
                  console.error('Error downloading invoice:', error);
                }
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Télécharger PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
