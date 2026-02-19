import { useState, useCallback } from "react";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

interface GuestLookupResult {
  found: boolean;
  guest?: {
    firstName: string;
    lastName: string;
    email?: string;
  };
}

export function usePmsGuestLookup(hotelId: string | undefined) {
  const [isLoading, setIsLoading] = useState(false);
  const [guestData, setGuestData] = useState<GuestLookupResult | null>(null);

  const lookupGuest = useCallback(
    async (roomNumber: string): Promise<GuestLookupResult | null> => {
      if (!hotelId || !roomNumber) return null;

      setIsLoading(true);
      try {
        const { data, error } = await invokeEdgeFunction<
          { hotelId: string; roomNumber: string },
          GuestLookupResult
        >("opera-cloud-guest-lookup", {
          body: { hotelId, roomNumber },
          skipAuth: true,
        });

        if (error) {
          console.error("[usePmsGuestLookup] Error:", error);
          return null;
        }

        setGuestData(data);
        return data;
      } catch (e) {
        console.error("[usePmsGuestLookup] Exception:", e);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [hotelId]
  );

  const resetGuest = useCallback(() => {
    setGuestData(null);
  }, []);

  return { lookupGuest, guestData, isLoading, resetGuest };
}
