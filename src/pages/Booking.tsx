import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Calendar as CalendarIcon, List, Search, ChevronLeft, ChevronRight, Clock, User, Phone, Euro, Building2, Users, FileText, Download } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CreateBookingDialog from "@/components/CreateBookingDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { format, addDays, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";

export default function Booking() {
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

          return {
            ...booking,
            totalDuration,
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

  // Generate hourly slots from 0:00 to 23:00 for main display (24h)
  const hours = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i); // 0 to 23
  }, []);

  // Generate 15-minute time slots for booking selection (24h)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 0; hour <= 23; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
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

  const getBookingsForHour = (date: Date, hour: number) => {
    const hourStr = hour.toString().padStart(2, '0');
    return filteredBookings?.filter(
      (booking) => {
        const bookingDate = booking.booking_date === format(date, "yyyy-MM-dd");
        const bookingHour = booking.booking_time?.substring(0, 2);
        return bookingDate && bookingHour === hourStr;
      }
    ) || [];
  };

  const isCurrentHour = (date: Date, hour: number) => {
    if (format(date, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd")) return false;
    const now = new Date(currentTime.toLocaleString("en-US", { timeZone: timezone }));
    return now.getHours() === hour;
  };

  const statusTranslations: Record<string, string> = {
    "Assigned": "Assigné",
    "Ongoing": "En cours",
    "Completed": "Complété",
    "Canceled": "Annulé",
    "Pending": "En attente",
    "En attente": "En attente",
  };

  const getTranslatedStatus = (status: string) => {
    return statusTranslations[status] || status;
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    
    if (normalizedStatus.includes("assign") || normalizedStatus === "assigné") {
      return "bg-blue-500/10 text-blue-700 hover:bg-blue-500/10";
    }
    if (normalizedStatus.includes("ongoing") || normalizedStatus.includes("en cours")) {
      return "bg-orange-500/10 text-orange-700 hover:bg-orange-500/10";
    }
    if (normalizedStatus.includes("complet")) {
      return "bg-green-500/10 text-green-700 hover:bg-green-500/10";
    }
    if (normalizedStatus.includes("cancel") || normalizedStatus.includes("annul")) {
      return "bg-red-500/10 text-red-700 hover:bg-red-500/10";
    }
    if (normalizedStatus.includes("pending") || normalizedStatus.includes("attente")) {
      return "bg-orange-500/10 text-orange-700 hover:bg-orange-500/10";
    }
    return "bg-gray-500/10 text-gray-700 hover:bg-gray-500/10";
  };

  return (
    <div className="min-h-screen bg-background p-6 overflow-x-hidden">
      <div className="max-w-7xl mx-auto w-full">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            📅 Réservations
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
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
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              Créer une réservation
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <div className="flex gap-4 flex-wrap items-center justify-between">
              <div className="flex gap-4 flex-wrap items-center flex-1">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filtrer par statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    <SelectItem value="Assigned">Assigné</SelectItem>
                    <SelectItem value="Ongoing">En cours</SelectItem>
                    <SelectItem value="Completed">Complété</SelectItem>
                    <SelectItem value="Canceled">Annulé</SelectItem>
                    <SelectItem value="Pending">En attente</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={hotelFilter} onValueChange={setHotelFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filtrer par hôtel" />
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

                <Select value={hairdresserFilter} onValueChange={setHairdresserFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filtrer par coiffeur" />
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
              </div>

              <div className="flex gap-2">
                <Button
                  variant={view === "calendar" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setView("calendar")}
                >
                  <CalendarIcon className="h-4 w-4" />
                  Calendrier
                </Button>
                <Button
                  variant={view === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setView("list")}
                >
                  <List className="h-4 w-4" />
                  Liste
                </Button>
              </div>
            </div>
          </div>

          {view === "calendar" ? (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <Button variant="outline" size="sm" onClick={handlePreviousWeek}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Semaine précédente
                </Button>
                <h2 className="text-xl font-semibold">
                  {format(currentWeekStart, "d MMM", { locale: fr })} -{" "}
                  {format(addDays(currentWeekStart, 6), "d MMM yyyy", { locale: fr })}
                </h2>
                <Button variant="outline" size="sm" onClick={handleNextWeek}>
                  Semaine suivante
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

              <div className="w-full overflow-hidden">
                <div className="w-full bg-card rounded-lg border border-border">
                  {/* Header avec les jours */}
                  <div className="grid grid-cols-8 border-b border-border sticky top-0 bg-card z-10">
                    <div className="p-3 border-r border-border bg-muted/30">
                      <span className="text-xs font-medium text-muted-foreground">Heure</span>
                    </div>
                    {weekDays.map((day) => {
                      const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                      return (
                        <div
                          key={day.toISOString()}
                          className={`p-3 text-center border-r border-border last:border-r-0 ${
                            isToday ? "bg-primary/5" : "bg-muted/30"
                          }`}
                        >
                          <div className="text-xs font-medium text-muted-foreground uppercase">
                            {format(day, "EEE", { locale: fr })}
                          </div>
                          <div className={`text-xl font-bold ${isToday ? "text-primary" : ""}`}>
                            {format(day, "d")}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {format(day, "MMM", { locale: fr })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Grille avec les créneaux horaires */}
                  <div className="relative">
                    {hours.map((hour) => {
                      const hourStr = `${hour.toString().padStart(2, '0')}:00`;
                      return (
                        <div key={hour} className="grid grid-cols-8 border-b border-border">
                          <div className="p-1 border-r border-border bg-muted/20 flex items-start">
                            <span className="text-[10px] font-medium text-muted-foreground">{hourStr}</span>
                          </div>
                          {weekDays.map((day) => {
                            const bookingsInHour = getBookingsForHour(day, hour);
                            const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                            const isCurrent = isCurrentHour(day, hour);
                            
                            return (
                              <div
                                key={`${day.toISOString()}-${hour}`}
                                className={`relative h-[40px] p-1 border-r border-border last:border-r-0 cursor-pointer transition-colors ${
                                  bookingsInHour.length > 0
                                    ? "bg-primary/5 hover:bg-primary/10"
                                    : isToday
                                    ? "bg-primary/[0.02] hover:bg-muted/30"
                                    : "hover:bg-muted/30"
                                }`}
                                onClick={() => handleCalendarClick(day, hourStr)}
                              >
                                {bookingsInHour.length > 0 && (
                                  <div className="space-y-0.5 h-full">
                                    <TooltipProvider>
                                      {bookingsInHour.map((booking) => {
                                        const duration = (booking as any).totalDuration || 0;
                                        const treatments = (booking as any).treatments || [];
                                        const heightInPixels = Math.max(40, (duration / 60) * 60);
                                        
                                        return (
                                          <Tooltip key={booking.id} delayDuration={300}>
                                            <TooltipTrigger asChild>
                                              <div
                                                className="p-1 rounded bg-primary/20 border border-primary/30 text-[9px] leading-tight cursor-pointer hover:bg-primary/30 transition-colors"
                                                style={{ minHeight: `${heightInPixels}px` }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedBooking(booking);
                                                  setIsEditDialogOpen(true);
                                                }}
                                              >
                                                <div className="font-medium text-foreground truncate">
                                                  {booking.booking_time?.substring(0, 5)} - {booking.client_first_name}
                                                </div>
                                                <Badge className={`text-[7px] w-fit px-0.5 py-0 h-3 mt-0.5 ${getStatusColor(booking.status)}`}>
                                                  {getTranslatedStatus(booking.status)}
                                                </Badge>
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="right" className="max-w-sm">
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
                                                  <span>Durée: {duration} min</span>
                                                </div>
                                                
                                                {treatments.length > 0 && (
                                                  <div className="space-y-1">
                                                    <div className="text-xs font-medium">Traitements:</div>
                                                    <ul className="text-xs space-y-1">
                                                      {treatments.map((treatment: any, idx: number) => (
                                                        <li key={idx} className="flex justify-between gap-2">
                                                          <span>{treatment.name}</span>
                                                          <span className="text-muted-foreground whitespace-nowrap">
                                                            {treatment.duration} min • €{treatment.price}
                                                          </span>
                                                        </li>
                                                      ))}
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
                                  </div>
                                )}
                                
                                {/* Barre de temps actuel */}
                                {isCurrent && (
                                  <div className="absolute left-0 right-0 h-0.5 bg-red-500 z-20 pointer-events-none top-1/2 -translate-y-1/2">
                                    <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b">
                    <TableHead className="font-semibold text-foreground">Booking ID</TableHead>
                    <TableHead className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Date
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Start time
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Durée
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold text-foreground">Status</TableHead>
                    <TableHead className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Client name
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Client phone
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Euro className="h-4 w-4" />
                        Total price
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Hotel
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Hair dresser
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Invoice
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings
                    ?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((booking, index) => (
                    <TableRow 
                      key={booking.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors border-b"
                      onClick={() => {
                        setSelectedBooking(booking);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <TableCell className="font-medium">#{booking.booking_id}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(booking.booking_date), "dd-MM-yyyy")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {booking.booking_time.substring(0, 5)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(booking as any).totalDuration > 0 ? `${(booking as any).totalDuration} min` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(booking.status)}>
                          {getTranslatedStatus(booking.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {booking.client_first_name} {booking.client_last_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{booking.phone}</TableCell>
                      <TableCell className="font-semibold">{booking.total_price}€</TableCell>
                      <TableCell className="text-muted-foreground">{booking.hotel_name || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{booking.hairdresser_name || "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
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
                          <FileText className="h-4 w-4 mr-2" />
                          Invoice
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredBookings?.length && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground">
                        Aucune réservation trouvée
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              
              {/* Pagination */}
              {filteredBookings && filteredBookings.length > itemsPerPage && (
                <div className="flex items-center justify-between px-4 py-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Display from {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredBookings.length)} on {filteredBookings.length} entries
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    {Array.from({ length: Math.ceil(filteredBookings.length / itemsPerPage) }, (_, i) => i + 1)
                      .filter(page => {
                        const totalPages = Math.ceil(filteredBookings.length / itemsPerPage);
                        return page === 1 || 
                               page === totalPages ||
                               (page >= currentPage - 1 && page <= currentPage + 1);
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
                      onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredBookings.length / itemsPerPage), p + 1))}
                      disabled={currentPage === Math.ceil(filteredBookings.length / itemsPerPage)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
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
