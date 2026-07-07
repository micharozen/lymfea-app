import { useState, useMemo, useEffect } from "react";
import type { BookingWithTreatments } from "./useBookingData";

function readStored(storageKey: string | undefined, field: string, fallback: string): string {
  if (!storageKey) return fallback;
  try {
    return sessionStorage.getItem(`${storageKey}.${field}`) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStored(storageKey: string | undefined, field: string, value: string): void {
  if (!storageKey) return;
  try {
    sessionStorage.setItem(`${storageKey}.${field}`, value);
  } catch {
    // sessionStorage indisponible (mode privé, quota) : on ignore silencieusement
  }
}

export function useBookingFilters(
  bookings: BookingWithTreatments[] | undefined,
  storageKey?: string
) {
  const [searchQuery, setSearchQuery] = useState(() => readStored(storageKey, "search", ""));
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    readStored(storageKey, "status", "all")
  );
  const [hotelFilter, setHotelFilter] = useState<string>(() =>
    readStored(storageKey, "hotel", "all")
  );
  const [therapistFilter, setTherapistFilter] = useState<string>(() =>
    readStored(storageKey, "therapist", "all")
  );

  useEffect(() => writeStored(storageKey, "search", searchQuery), [storageKey, searchQuery]);
  useEffect(() => writeStored(storageKey, "status", statusFilter), [storageKey, statusFilter]);
  useEffect(() => writeStored(storageKey, "hotel", hotelFilter), [storageKey, hotelFilter]);
  useEffect(
    () => writeStored(storageKey, "therapist", therapistFilter),
    [storageKey, therapistFilter]
  );

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
