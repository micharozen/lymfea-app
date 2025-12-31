import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { decodeHtmlEntities } from "@/lib/utils";
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
import { TimezoneSelector } from "@/components/TimezoneSelector";
import { useTimezone } from "@/contexts/TimezoneContext";

import { StatusBadge } from "@/components/StatusBadge";
import { getBookingStatusConfig, getPaymentStatusConfig } from "@/utils/statusStyles";
import { useUserContext } from "@/hooks/useUserContext";
import { format, addDays, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";

export default function Booking() {
  const { isAdmin, isConcierge } = useUserContext();
  const { activeTimezone } = useTimezone();
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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [invoiceHTML, setInvoiceHTML] = useState("");
  const [invoiceBookingId, setInvoiceBookingId] = useState<number | null>(null);
  const [invoiceIsRoomPayment, setInvoiceIsRoomPayment] = useState(false);
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

  // Force "no scroll anywhere" on this page (fits content via pagination)
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Refs for measuring actual heights
  const headerRef = useRef<HTMLDivElement>(null);
  const paginationRef = useRef<HTMLDivElement>(null);

  // Auto-fit the number of rows so the page never needs scrolling
  const computeRows = useCallback(() => {
    if (view !== 'list') return;

    // Match the actual rendered row height (TableRow default is h-12)
    const rowHeight = 48;
    const tableHeaderHeight = 32; // h-8 = 32px
    const paginationHeight = 48;
    const sidebarOffset = 64; // sidebar margin

    // Get actual header height (title + filters)
    const headerHeight = headerRef.current?.offsetHeight || 140;
    // Content padding
    const contentPadding = 48;

    const usedHeight = headerHeight + tableHeaderHeight + paginationHeight + contentPadding + sidebarOffset;
    const availableForRows = window.innerHeight - usedHeight;
    const rows = Math.max(5, Math.floor(availableForRows / rowHeight));

    setItemsPerPage(rows);
  }, [view]);

  useEffect(() => {
    computeRows();
    window.addEventListener("resize", computeRows);
    return () => window.removeEventListener("resize", computeRows);
  }, [computeRows]);

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

  // Generate hourly slots from 07:00 to 23:00 for main display
  const START_HOUR = 7;
  const END_HOUR = 24; // 24 means we show up to 23:00 slot
  const HOUR_HEIGHT = 40; // pixels per hour - compact view
  
  const hours = useMemo(() => {
    return Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR); // 7 to 23
  }, []);

  // Generate 10-minute time slots for booking selection (7h-23h)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 7; hour <= 22; hour++) {
      for (let minute = 0; minute < 60; minute += 10) {
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    // Add 23:00 as last slot
    slots.push('23:00');
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

  const paginatedBookings =
    filteredBookings?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage) ?? [];

  // Keep layout stable across pagination: render empty rows to fill the table height
  const totalListColumns = 10;
  const emptyRowsCount = Math.max(0, itemsPerPage - paginatedBookings.length);
  const totalPages = Math.max(1, Math.ceil((filteredBookings?.length ?? 0) / itemsPerPage));

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
    const now = new Date(currentTime.toLocaleString("en-US", { timeZone: activeTimezone }));
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
      {/* Header & Filters - Fixed */}
      <div ref={headerRef} className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            📅 Bookings
          </h1>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            Create a booking
          </Button>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-[140px]"
          />
        </div>

        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setCurrentPage(1); }}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="quote_pending">Devis</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="confirmed">Confirmé</SelectItem>
            <SelectItem value="ongoing">En cours</SelectItem>
            <SelectItem value="completed">Terminé</SelectItem>
            <SelectItem value="cancelled">Annulé</SelectItem>
          </SelectContent>
        </Select>

        {isAdmin && (
          <Select value={hotelFilter} onValueChange={(value) => { setHotelFilter(value); setCurrentPage(1); }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Tous les hôtels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les hôtels</SelectItem>
              {hotels?.map((hotel) => (
                <SelectItem key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={hairdresserFilter} onValueChange={(value) => { setHairdresserFilter(value); setCurrentPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tous les coiffeurs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les coiffeurs</SelectItem>
            {hairdressers?.map((hairdresser) => (
              <SelectItem key={hairdresser.id} value={hairdresser.id}>
                {hairdresser.first_name} {hairdresser.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <TimezoneSelector compact showReset className="ml-2" />

        <div className="ml-auto flex items-center border rounded-md overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("calendar")}
            className={`rounded-none border-0 ${view === "calendar" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            <CalendarIcon className="h-4 w-4 mr-1" />
            Calendrier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("list")}
            className={`rounded-none border-0 ${view === "list" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            <List className="h-4 w-4 mr-1" />
            Liste
          </Button>
        </div>
        </div>
      </div>

      {/* Content - Takes remaining space */}
      <div className="flex-1 px-4 md:px-6 pb-4 md:pb-6 overflow-hidden">
        <div className="bg-card rounded-lg border border-border h-full flex flex-col">
        {view === "calendar" ? (
            <div className="p-2 md:p-6 overflow-hidden">
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

              <div className="w-full overflow-hidden -mx-2 md:mx-0 px-2 md:px-0">
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
                      const now = new Date(currentTime.toLocaleString("en-US", { timeZone: activeTimezone }));
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
            <div className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden bg-card">
              <Table className="text-xs w-full table-fixed h-full">
                <colgroup>
                  <col className="w-[7%]" />   {/* Booking ID */}
                  <col className="w-[10%]" />  {/* Date */}
                  <col className="w-[7%]" />   {/* Start time */}
                  <col className="w-[10%]" />  {/* Status */}
                  <col className="w-[10%]" />  {/* Payment */}
                  <col className="w-[14%]" />  {/* Client name */}
                  <col className="w-[9%]" />   {/* Total price */}
                  <col className="w-[12%]" />  {/* Hotel */}
                  <col className="w-[12%]" />  {/* Hair dresser */}
                  <col className="w-[9%]" />   {/* Invoice */}
                </colgroup>
                <TableHeader>
                  <TableRow className="border-b h-8 bg-muted/20">
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Booking...</TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Date</TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Start t...</TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Status</TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center">Payment</TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Client name</TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Total price</TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Hotel</TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Hair dresser</TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-center">Invoice</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedBookings.map((booking) => (
                    <TableRow
                      key={booking.id}
                      className="cursor-pointer border-b hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setSelectedBooking(booking);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <TableCell className="font-medium text-primary h-12 py-0 px-2 overflow-hidden">
                        <span className="truncate block leading-none">#{booking.booking_id}</span>
                      </TableCell>
                      <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                        <span className="truncate block leading-none">{format(new Date(booking.booking_date), "dd-MM-yyyy")}</span>
                      </TableCell>
                      <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                        <span className="truncate block leading-none">{booking.booking_time.substring(0, 5)}</span>
                      </TableCell>
                      <TableCell className="h-12 py-0 px-2 overflow-hidden">
                        <StatusBadge status={booking.status} type="booking" className="text-[10px] px-2 py-0.5 whitespace-nowrap" />
                      </TableCell>
                      <TableCell className="h-12 py-0 px-2 overflow-hidden text-center">
                        {/* Hide payment status for quote_pending and waiting_approval */}
                        {booking.status !== 'quote_pending' && booking.status !== 'waiting_approval' && (
                          <StatusBadge
                            status={booking.payment_status || "pending"}
                            type="payment"
                            className="text-base px-2 py-0.5 whitespace-nowrap inline-flex items-center justify-center"
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                        <span className="truncate block leading-none">{booking.client_first_name} {booking.client_last_name}</span>
                      </TableCell>
                      <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                        <span className="truncate block leading-none">€{booking.total_price?.toFixed(2) || "0.00"}</span>
                      </TableCell>
                      <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                        <span className="truncate block leading-none">{booking.hotel_name || "-"}</span>
                      </TableCell>
                      <TableCell className="text-foreground h-12 py-0 px-2 overflow-hidden">
                        <span className="truncate block leading-none">{booking.hairdresser_name || "-"}</span>
                      </TableCell>
                      <TableCell className="h-12 py-0 px-2 overflow-hidden text-center">
                        {/* Document visibility logic by role - hide for quote_pending and waiting_approval */}
                        {booking.status !== 'quote_pending' && booking.status !== 'waiting_approval' && (() => {
                          const isCompleted = booking.status === "completed" || booking.payment_status === "paid" || booking.payment_status === "charged_to_room";
                          const isRoomPayment = booking.payment_method === "room";
                          const hasStripeInvoice = !!booking.stripe_invoice_url;
                          
                          // Admin: Always show relevant document
                          if (isAdmin && isCompleted) {
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="inline-flex items-center justify-center gap-1.5 w-20 py-1 text-xs font-medium rounded-md border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/40 transition-all"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (hasStripeInvoice) {
                                          window.open(booking.stripe_invoice_url, "_blank");
                                        } else {
                                          supabase.functions
                                            .invoke("generate-invoice", {
                                              body: { bookingId: booking.id },
                                            })
                                            .then(({ data, error }) => {
                                              if (!error && data) {
                                                setInvoiceHTML(data.html);
                                                setInvoiceBookingId(data.bookingId);
                                                setInvoiceIsRoomPayment(isRoomPayment);
                                                setIsInvoicePreviewOpen(true);
                                              }
                                            });
                                        }
                                      }}
                                    >
                                      <FileText className="h-3.5 w-3.5" />
                                      <span>{hasStripeInvoice ? "Facture" : "Bon"}</span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {hasStripeInvoice 
                                      ? "Voir la Facture Stripe" 
                                      : "Télécharger le Bon de Prestation"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          }
                          
                          // Concierge: Only show "Bon de Prestation" for room payments
                          if (isConcierge && isCompleted && isRoomPayment) {
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="inline-flex items-center justify-center gap-1.5 w-20 py-1 text-xs font-medium rounded-md border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/40 transition-all"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        supabase.functions
                                          .invoke("generate-invoice", {
                                            body: { bookingId: booking.id },
                                          })
                                          .then(({ data, error }) => {
                                            if (!error && data) {
                                              setInvoiceHTML(data.html);
                                              setInvoiceBookingId(data.bookingId);
                                              setInvoiceIsRoomPayment(true);
                                              setIsInvoicePreviewOpen(true);
                                            }
                                          });
                                      }}
                                    >
                                      <FileText className="h-3.5 w-3.5" />
                                      <span>Bon</span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Télécharger le Bon de Prestation
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          }
                          
                          return null;
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredBookings?.length
                    ? Array.from({ length: emptyRowsCount }).map((_, idx) => (
                        <TableRow key={`empty-${idx}`} className="h-12 border-b" aria-hidden>
                          <TableCell colSpan={totalListColumns} className="h-12 py-0 px-2">&nbsp;</TableCell>
                        </TableRow>
                      ))
                    : null}

                  {!filteredBookings?.length && (
                    <TableRow>
                      <TableCell colSpan={totalListColumns} className="text-center text-muted-foreground py-6">
                        No bookings found
                      </TableCell>
                    </TableRow>
                  )}

                </TableBody>
              </Table>
              </div>

              {/* Pagination - Always fixed at bottom */}
              <div
                ref={paginationRef}
                className="flex items-center justify-between px-3 py-2 border-t flex-shrink-0 bg-card"
              >
                <div className="text-sm text-muted-foreground">
                  {filteredBookings && filteredBookings.length > 0
                    ? `Display from ${((currentPage - 1) * itemsPerPage) + 1} to ${Math.min(currentPage * itemsPerPage, filteredBookings.length)} on ${filteredBookings.length} entries`
                    : 'No entries'}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        return (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        );
                      })
                      .map((page, idx, arr) => (
                        <div key={page} className="flex items-center">
                          {idx > 0 && arr[idx - 1] !== page - 1 && (
                            <span className="px-2 text-muted-foreground">...</span>
                          )}
                          <Button
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                            className="min-w-[40px]"
                          >
                            {page}
                          </Button>
                        </div>
                      ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
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
            <DialogTitle>
              {invoiceIsRoomPayment ? `Bon de Prestation #${invoiceBookingId}` : `Aperçu de la facture #${invoiceBookingId}`}
            </DialogTitle>
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
                        filename: invoiceIsRoomPayment ? `bon-prestation-${invoiceBookingId}.pdf` : `invoice-${invoiceBookingId}.pdf`,
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
