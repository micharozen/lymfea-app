import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Building2, Check, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";

interface VenueOption {
  id: string;
  name: string;
}

async function fetchVenueOptions(): Promise<VenueOption[]> {
  const { data, error } = await supabase
    .from("hotels")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as VenueOption[];
}

export function ViewModeSwitcher() {
  const { canSwitch, mode, switchToVenue } = useViewMode();
  const { state } = useSidebar();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isCollapsed = state === "collapsed";

  const { data: venues, isLoading } = useQuery({
    queryKey: ["view-mode-switcher", "venues"],
    queryFn: fetchVenueOptions,
    enabled: open && canSwitch,
    staleTime: 60_000,
  });

  if (!canSwitch || mode !== "admin") return null;

  const handleSelect = (venueId: string) => {
    switchToVenue(venueId);
    setOpen(false);
    navigate("/admin");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
          aria-label="Switcher vers l'espace Gestion du lieu"
          title="Switcher vers l'espace Gestion du lieu"
        >
          <ArrowRightLeft className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.75} />
          <span className="text-sm group-data-[collapsible=icon]:hidden">
            Espace Gestion du lieu
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={isCollapsed ? "right" : "right"}
        align="start"
        className="w-72 p-0"
      >
        <div className="px-3 py-2 border-b border-border">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Choisir un lieu
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            Vous basculerez en mode Gestion du lieu pour ce lieu.
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {isLoading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Chargement…
            </div>
          )}
          {!isLoading && venues && venues.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Aucun lieu disponible.
            </div>
          )}
          {!isLoading &&
            venues?.map((venue) => (
              <button
                key={venue.id}
                type="button"
                onClick={() => handleSelect(venue.id)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent/60 transition-colors"
              >
                <Building2 className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                <span className="flex-1 truncate">{venue.name}</span>
                <Check className="h-3.5 w-3.5 opacity-0" />
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
