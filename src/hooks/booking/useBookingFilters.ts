import { useState, useMemo } from "react";
import type { BookingWithTreatments } from "./useBookingData";

export function useBookingFilters(bookings: BookingWithTreatments[] | undefined) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [hairdresserFilter, setHairdresserFilter] = useState<string>("all");

  const filteredBookings = useMemo(() => {
    return bookings?.filter((booking) => {
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
  }, [bookings, searchQuery, statusFilter, hotelFilter, hairdresserFilter]);

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setHotelFilter("all");
    setHairdresserFilter("all");
  };

  return {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    hotelFilter,
    setHotelFilter,
    hairdresserFilter,
    setHairdresserFilter,
    filteredBookings,
    resetFilters,
  };
}
