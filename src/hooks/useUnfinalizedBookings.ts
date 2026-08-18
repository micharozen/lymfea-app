import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "@/lib/billingPeriod";

// Payment statuses considered as "paid" — must stay in sync with the
// generate-therapist-invoices edge function.
const PAID_STATUSES = ["paid", "charged_to_room", "offert"] as const;

export interface PendingBooking {
  id: string;
  booking_date: string;
  total_price: number | null;
  client_first_name: string | null;
  client_last_name: string | null;
  hotel_name: string | null;
}

interface UseUnfinalizedBookingsParams {
  hotelId?: string;
  therapistId?: string;
  range: DateRange;
  enabled?: boolean;
}

interface UseUnfinalizedBookingsResult {
  bookings: PendingBooking[];
  isLoading: boolean;
  finalizing: boolean;
  finalize: () => Promise<number>;
  refetch: () => Promise<void>;
}

/**
 * Réservations payées de la période qui ne sont ni finalisées ni annulées :
 * elles sont exclues des factures tant qu'elles ne sont pas passées en
 * `completed`.
 *
 * Les no-shows sont volontairement écartés : ils sont déjà facturés à 100 % et
 * les finaliser les basculerait à tort en `completed`.
 */
export function useUnfinalizedBookings({
  hotelId,
  therapistId,
  range,
  enabled = true,
}: UseUnfinalizedBookingsParams): UseUnfinalizedBookingsResult {
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled || (!hotelId && !therapistId)) {
      setBookings([]);
      return;
    }
    setIsLoading(true);
    try {
      let query = supabase
        .from("bookings")
        .select(
          "id, booking_date, total_price, client_first_name, client_last_name, hotels(name)",
        )
        .gte("booking_date", range.start)
        .lte("booking_date", range.end)
        .not("status", "in", "(completed,cancelled,noshow,no_show)")
        .in("payment_status", PAID_STATUSES)
        .order("booking_date");

      if (hotelId) query = query.eq("hotel_id", hotelId);
      if (therapistId) query = query.eq("therapist_id", therapistId);

      const { data, error } = await query;
      if (error) throw error;

      setBookings(
        (data ?? []).map((b) => ({
          id: b.id,
          booking_date: b.booking_date,
          total_price: b.total_price,
          client_first_name: b.client_first_name,
          client_last_name: b.client_last_name,
          hotel_name: (b as { hotels?: { name?: string } | null }).hotels?.name ?? null,
        })),
      );
    } catch (err) {
      console.error("Error loading unfinalized bookings:", err);
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, hotelId, therapistId, range.start, range.end]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  /** Passe toutes les réservations listées en `completed`. Renvoie leur nombre. */
  const finalize = useCallback(async (): Promise<number> => {
    if (bookings.length === 0) return 0;
    setFinalizing(true);
    try {
      const count = bookings.length;
      const { error } = await supabase
        .from("bookings")
        .update({ status: "completed" })
        .in(
          "id",
          bookings.map((b) => b.id),
        );
      if (error) throw error;
      await refetch();
      return count;
    } finally {
      setFinalizing(false);
    }
  }, [bookings, refetch]);

  return { bookings, isLoading, finalizing, finalize, refetch };
}
