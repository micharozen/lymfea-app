import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useBookingData, useBookingFilters } from "@/hooks/booking";
import { setOneSignalExternalUserId } from "@/hooks/useOneSignal";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import PwaHeader from "@/components/pwa/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { formatPrice } from "@/lib/formatPrice";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Search, RefreshCw, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminPwaDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { bookings, hotels, getHotelInfo, refetch } = useBookingData();
  const {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    hotelFilter,
    setHotelFilter,
    filteredBookings,
  } = useBookingFilters(bookings);

  // Register OneSignal external user ID on mount
  useEffect(() => {
    const registerPush = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setOneSignalExternalUserId(user.id);
      }
    };
    registerPush();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Group bookings by date
  const groupedBookings = (filteredBookings || [])
    .sort((a, b) => {
      const dateCompare = b.booking_date.localeCompare(a.booking_date);
      if (dateCompare !== 0) return dateCompare;
      return (b.booking_time || "").localeCompare(a.booking_time || "");
    })
    .reduce<Record<string, typeof filteredBookings>>((groups, booking) => {
      const date = booking.booking_date;
      if (!groups[date]) groups[date] = [];
      groups[date]!.push(booking);
      return groups;
    }, {});

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return "Aujourd'hui";
    if (isTomorrow(date)) return "Demain";
    return format(date, "EEEE d MMMM", { locale: fr });
  };

  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      <PwaHeader
        title="Réservations"
        rightSlot={
          <button
            onClick={handleRefresh}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        }
      />

      <PushNotificationPrompt />

      {/* Search & Filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un client..."
              className="pl-9 h-9"
            />
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="En attente">En attente</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmé</SelectItem>
                <SelectItem value="completed">Terminé</SelectItem>
                <SelectItem value="cancelled">Annulé</SelectItem>
              </SelectContent>
            </Select>
            <Select value={hotelFilter} onValueChange={setHotelFilter}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="Hôtel" />
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
          </div>
        )}
      </div>

      {/* Booking List */}
      <div className="flex-1 min-h-0">
        {!filteredBookings || filteredBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune réservation</h3>
            <p className="text-sm text-gray-500">
              {searchQuery || statusFilter !== "all" || hotelFilter !== "all"
                ? "Aucune réservation ne correspond à vos filtres"
                : "Aucune réservation pour le moment"}
            </p>
          </div>
        ) : (
          <div className="pb-4">
            {Object.entries(groupedBookings).map(([date, dateBookings]) => (
              <div key={date}>
                <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm px-4 py-2 border-b border-gray-200">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {getDateLabel(date)} ({dateBookings!.length})
                  </h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {dateBookings!.map((booking) => {
                    const hotel = getHotelInfo(booking.hotel_id);
                    return (
                      <button
                        key={booking.id}
                        onClick={() => navigate(`/admin-pwa/booking/${booking.id}`)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors bg-white"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {booking.client_first_name} {booking.client_last_name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                #{booking.booking_id}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{booking.booking_time?.substring(0, 5)}</span>
                              <span>·</span>
                              <span className="truncate">{hotel?.name || booking.hotel_name || "-"}</span>
                              {booking.hairdresser_name && (
                                <>
                                  <span>·</span>
                                  <span className="truncate">{booking.hairdresser_name}</span>
                                </>
                              )}
                            </div>
                            {booking.treatments.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {booking.treatments.slice(0, 2).map((t, i) => (
                                  <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                    {t.name}
                                  </span>
                                ))}
                                {booking.treatments.length > 2 && (
                                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                    +{booking.treatments.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <StatusBadge status={booking.status} type="booking" className="text-[10px]" />
                            <span className="text-sm font-semibold">
                              {formatPrice(booking.total_price, hotel?.currency || 'EUR')}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
