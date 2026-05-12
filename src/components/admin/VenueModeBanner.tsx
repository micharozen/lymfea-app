import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useViewMode } from "@/contexts/ViewModeContext";

async function fetchVenueName(venueId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("hotels")
    .select("name")
    .eq("id", venueId)
    .maybeSingle();
  if (error) return null;
  return data?.name ?? null;
}

export function VenueModeBanner() {
  const { mode, venueId, switchToAdmin } = useViewMode();

  const { data: venueName } = useQuery({
    queryKey: ["venue-mode-banner", venueId],
    queryFn: () => fetchVenueName(venueId as string),
    enabled: mode === "venue_manager" && !!venueId,
    staleTime: 5 * 60_000,
  });

  if (mode !== "venue_manager" || !venueId) return null;

  return (
    <div className="sticky top-0 z-40 w-full bg-primary/10 border-b border-primary/30 text-primary">
      <div className="flex items-center justify-between gap-3 px-4 py-1.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />
          <span className="font-medium truncate">
            Mode Gestion du lieu{venueName ? ` — ${venueName}` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={switchToAdmin}
          className="flex items-center gap-1 font-medium hover:underline whitespace-nowrap"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Revenir au mode admin
        </button>
      </div>
    </div>
  );
}
