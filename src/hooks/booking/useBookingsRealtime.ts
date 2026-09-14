import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseBookingsRealtimeOptions {
  /** Nom du canal Realtime. Doit être unique par écran : Supabase indexe par nom. */
  channelName: string;
  onBookingsChange: () => void;
  onHotelsChange?: () => void;
}

/**
 * Abonnement Realtime partagé par la liste et le planning. Les rafales sont
 * absorbées : une seule modification de réservation déclenche plusieurs
 * événements postgres_changes, on ne recharge qu'une fois.
 */
export function useBookingsRealtime({
  channelName,
  onBookingsChange,
  onHotelsChange,
}: UseBookingsRealtimeOptions) {
  const bookingsRef = useRef(onBookingsChange);
  bookingsRef.current = onBookingsChange;
  const hotelsRef = useRef(onHotelsChange);
  hotelsRef.current = onHotelsChange;

  useEffect(() => {
    // Remove any stale channel with this name before creating a new one.
    // Needed because React Strict Mode runs effects twice and supabase.channel()
    // returns the same (already-subscribed) object when given the same name,
    // causing "cannot add callbacks after subscribe()" errors.
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (stale) supabase.removeChannel(stale);

    const channel = supabase.channel(channelName);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        bookingsRef.current();
      }, 500);
    };

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bookings" },
      scheduleRefetch,
    );

    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "hotels" }, () => {
      hotelsRef.current?.();
    });

    channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [channelName]);
}
