import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import VenueDetail from "@/pages/admin/VenueDetail";
import type { VenueSectionId } from "@/components/admin/venue/VenueGeneralTab";

const RESTRICTED_SECTIONS: VenueSectionId[] = [
  "identity",
  "location",
  "team",
  "payment",
];

export default function MyVenue() {
  const { role, hotelIds, loading } = useUser();
  const { mode, venueId } = useViewMode();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  let hotelId: string | null = null;
  if (role === "concierge") {
    hotelId = hotelIds[0] ?? null;
  } else if (role === "admin" && mode === "venue_manager") {
    hotelId = venueId;
  }

  if (!hotelId) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <VenueDetail
      hotelIdOverride={hotelId}
      restricted
      restrictedSections={RESTRICTED_SECTIONS}
      showTherapistTab
      backTo="/admin"
    />
  );
}
