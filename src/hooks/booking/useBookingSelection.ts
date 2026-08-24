import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getBookingById } from "@shared/db";
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

  // Open booking from URL parameter (from email link). La réservation visée
  // n'est pas forcément dans les lots déjà chargés : on la lit par son id
  // plutôt que de la chercher dans la liste.
  useEffect(() => {
    if (hasOpenedFromUrl) return;

    const bookingIdFromUrl = searchParams.get('bookingId');
    if (!bookingIdFromUrl) return;

    setHasOpenedFromUrl(true);
    let cancelled = false;
    (async () => {
      const booking =
        bookings?.find((b) => b.id === bookingIdFromUrl) ??
        (await getBookingById(supabase, bookingIdFromUrl));
      if (cancelled || !booking) return;
      setSelectedBooking(booking);
      onOpenEdit?.();
      setSearchParams({}, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
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
