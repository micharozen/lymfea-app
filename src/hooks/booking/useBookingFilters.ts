import { useState, useMemo, useEffect } from "react";
import type { BookingWithTreatments } from "./useBookingData";
import { PAYMENT_METHOD_UNSET } from "@/lib/paymentMethod";

/**
 * Filtres multi-sélection. Un tableau vide signifie "aucune restriction" :
 * c'est l'état par défaut, et il évite une valeur sentinelle du type "all".
 */
export interface BookingFilterValues {
  searchQuery: string;
  status: string[];
  hotel: string[];
  therapist: string[];
  paymentMethod: string[];
  paymentStatus: string[];
}

function readStored(storageKey: string | undefined, field: string): string[] {
  if (!storageKey) return [];
  try {
    const raw = sessionStorage.getItem(`${storageKey}.${field}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeStored(storageKey: string | undefined, field: string, value: string[]): void {
  if (!storageKey) return;
  try {
    sessionStorage.setItem(`${storageKey}.${field}`, JSON.stringify(value));
  } catch {
    // sessionStorage indisponible (mode privé, quota) : on ignore silencieusement
  }
}

function readSearch(storageKey: string | undefined): string {
  if (!storageKey) return "";
  try {
    return sessionStorage.getItem(`${storageKey}.search`) ?? "";
  } catch {
    return "";
  }
}

/** Un tableau vide n'exclut rien ; sinon la valeur doit être dans la sélection. */
const matchesAny = (selection: string[], value: string | null | undefined): boolean =>
  selection.length === 0 || (!!value && selection.includes(value));

/**
 * Prédicat de filtrage, isolé de React pour rester testable.
 * Exporté pour les tests unitaires.
 */
export function matchesBookingFilters(
  booking: BookingWithTreatments,
  filters: BookingFilterValues,
): boolean {
  const searchLower = filters.searchQuery.toLowerCase();
  const matchesSearch =
    !searchLower ||
    !!booking.client_first_name?.toLowerCase().includes(searchLower) ||
    !!booking.client_last_name?.toLowerCase().includes(searchLower) ||
    !!booking.phone?.toLowerCase().includes(searchLower);

  // Le mode de paiement accepte une sentinelle "non renseigné", qui cible les
  // réservations sans payment_method — impossible à exprimer autrement.
  const matchesPaymentMethod =
    filters.paymentMethod.length === 0 ||
    (!booking.payment_method
      ? filters.paymentMethod.includes(PAYMENT_METHOD_UNSET)
      : filters.paymentMethod.includes(booking.payment_method));

  return (
    matchesSearch &&
    matchesAny(filters.status, booking.status) &&
    matchesAny(filters.hotel, booking.hotel_id) &&
    matchesAny(filters.therapist, booking.therapist_id) &&
    matchesPaymentMethod &&
    matchesAny(filters.paymentStatus, booking.payment_status)
  );
}

export function useBookingFilters(
  bookings: BookingWithTreatments[] | undefined,
  storageKey?: string
) {
  const [searchQuery, setSearchQuery] = useState(() => readSearch(storageKey));
  const [statusFilter, setStatusFilter] = useState<string[]>(() =>
    readStored(storageKey, "status")
  );
  const [hotelFilter, setHotelFilter] = useState<string[]>(() => readStored(storageKey, "hotel"));
  const [therapistFilter, setTherapistFilter] = useState<string[]>(() =>
    readStored(storageKey, "therapist")
  );
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string[]>(() =>
    readStored(storageKey, "payment")
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>(() =>
    readStored(storageKey, "paymentStatus")
  );

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(`${storageKey}.search`, searchQuery);
    } catch {
      // ignoré
    }
  }, [storageKey, searchQuery]);
  useEffect(() => writeStored(storageKey, "status", statusFilter), [storageKey, statusFilter]);
  useEffect(() => writeStored(storageKey, "hotel", hotelFilter), [storageKey, hotelFilter]);
  useEffect(
    () => writeStored(storageKey, "therapist", therapistFilter),
    [storageKey, therapistFilter]
  );
  useEffect(
    () => writeStored(storageKey, "payment", paymentMethodFilter),
    [storageKey, paymentMethodFilter]
  );
  useEffect(
    () => writeStored(storageKey, "paymentStatus", paymentStatusFilter),
    [storageKey, paymentStatusFilter]
  );

  const filteredBookings = useMemo(() => {
    const filters: BookingFilterValues = {
      searchQuery,
      status: statusFilter,
      hotel: hotelFilter,
      therapist: therapistFilter,
      paymentMethod: paymentMethodFilter,
      paymentStatus: paymentStatusFilter,
    };
    return bookings?.filter((booking) => matchesBookingFilters(booking, filters));
  }, [
    bookings,
    searchQuery,
    statusFilter,
    hotelFilter,
    therapistFilter,
    paymentMethodFilter,
    paymentStatusFilter,
  ]);

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter([]);
    setHotelFilter([]);
    setTherapistFilter([]);
    setPaymentMethodFilter([]);
    setPaymentStatusFilter([]);
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
    paymentMethodFilter,
    setPaymentMethodFilter,
    paymentStatusFilter,
    setPaymentStatusFilter,
    filteredBookings,
    resetFilters,
  };
}
