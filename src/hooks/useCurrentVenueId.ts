import { useUser } from "@/contexts/UserContext";
import { useViewMode } from "@/contexts/ViewModeContext";

/**
 * Returns the venue id whose data should be displayed for the current user.
 * - admin in venue_manager mode → the venue chosen via the switcher
 * - real concierge → their assigned venue
 * - admin in admin mode → null (no scope, sees everything)
 */
export function useCurrentVenueId(): string | null {
  const { mode, venueId } = useViewMode();
  const { hotelIds, isConcierge } = useUser();

  if (mode === "venue_manager" && venueId) return venueId;
  if (isConcierge && hotelIds.length > 0) return hotelIds[0];
  return null;
}
