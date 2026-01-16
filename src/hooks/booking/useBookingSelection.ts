import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { BookingWithTreatments } from "./useBookingData";

interface UseBookingSelectionOptions {
  bookings: BookingWithTreatments[] | undefined;
  onOpenEdit?: () => void;
}

export function useBookingSelection({ bookings, onOpenEdit }: UseBookingSelectionOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedBooking, setSelectedBooking] = useState<BookingWithTreatments | null>(null);
  const [hasOpenedFromUrl, setHasOpenedFromUrl] = useState(false);

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
        onOpenEdit?.();
        setHasOpenedFromUrl(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [bookings, searchParams, hasOpenedFromUrl, setSearchParams, onOpenEdit]);

  const clearSelection = () => {
    setSelectedBooking(null);
  };

  return {
    selectedBooking,
    setSelectedBooking,
    clearSelection,
  };
}
