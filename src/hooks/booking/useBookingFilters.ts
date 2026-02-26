import { useState, useMemo } from "react";
import type { BookingWithTreatments } from "./useBookingData";

export function useBookingFilters(bookings: BookingWithTreatments[] | undefined) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [therapistFilter, setTherapistFilter] = useState<string>("all");

  const filteredBookings = useMemo(() => {
    return bookings?.filter((booking) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        booking.client_first_name?.toLowerCase().includes(searchLower) ||
        booking.client_last_name?.toLowerCase().includes(searchLower) ||
        booking.phone?.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === "all" || booking.status === statusFilter;
      const matchesHotel = hotelFilter === "all" || booking.hotel_id === hotelFilter;
      const matchesTherapist =
        therapistFilter === "all" || booking.therapist_id === therapistFilter;

      return matchesSearch && matchesStatus && matchesHotel && matchesTherapist;
    });
  }, [bookings, searchQuery, statusFilter, hotelFilter, therapistFilter]);

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setHotelFilter("all");
    setTherapistFilter("all");
  };

  return {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    hotelFilter,
    setHotelFilter,
    therapistFilter,
    setTherapistFilter,
    filteredBookings,
    resetFilters,
  };
}
