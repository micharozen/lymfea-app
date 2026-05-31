import { useState, useCallback } from "react";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

interface GuestVerifyResult {
  verified: boolean;
}

/**
 * Client-flow PMS verification. Given a room number + last name, asks the backend
 * whether they match a current reservation. Returns ONLY a boolean — no guest PII
 * is ever sent to the browser (the contact details are resolved server-side at
 * booking creation). This is the secure replacement for room-number-only lookup.
 */
export function usePmsGuestVerify(hotelId: string | undefined) {
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyGuest = useCallback(
    async (roomNumber: string, lastName: string): Promise<boolean> => {
      if (!hotelId || !roomNumber || !lastName) return false;

      setIsVerifying(true);
      try {
        const { data, error } = await invokeEdgeFunction<
          { hotelId: string; roomNumber: string; lastName: string },
          GuestVerifyResult
        >("pms-guest-verify", {
          body: { hotelId, roomNumber, lastName },
          skipAuth: true,
        });

        if (error) {
          console.error("[usePmsGuestVerify] Error:", error);
          return false;
        }

        return !!data?.verified;
      } catch (e) {
        console.error("[usePmsGuestVerify] Exception:", e);
        return false;
      } finally {
        setIsVerifying(false);
      }
    },
    [hotelId]
  );

  return { verifyGuest, isVerifying };
}
