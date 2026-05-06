import { useUser } from "@/contexts/UserContext";
import { useViewMode } from "@/contexts/ViewModeContext";

export interface EffectiveRole {
  role: "admin" | "concierge" | null;
  isAdmin: boolean;
  isConcierge: boolean;
  isVenueManagerView: boolean;
  showsConciergeUx: boolean;
  effectiveVenueId: string | null;
}

export function useEffectiveRole(): EffectiveRole {
  const { role, isAdmin, isConcierge } = useUser();
  const { mode, venueId } = useViewMode();
  const isVenueManagerView = mode === "venue_manager";
  return {
    role,
    isAdmin,
    isConcierge,
    isVenueManagerView,
    showsConciergeUx: isConcierge || isVenueManagerView,
    effectiveVenueId: isVenueManagerView ? venueId : null,
  };
}
