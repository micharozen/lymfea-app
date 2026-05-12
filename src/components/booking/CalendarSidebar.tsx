import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, PanelLeft, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAmenityType, getAmenityLabel } from "@/lib/amenityTypes";
import { CalendarLegend } from "./CalendarLegend";
import type { Hotel } from "@/hooks/booking";

const SIDEBAR_COLLAPSED_KEY = "planning-sidebar-collapsed";

export interface CalendarEntry {
  id: string;
  type: "treatments" | "amenity";
  label: string;
  color: string;
  amenityType?: string;
}

interface CalendarSidebarProps {
  entries: CalendarEntry[];
  visibleCalendars: Record<string, boolean>;
  onToggle: (id: string, visible: boolean) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  hotels?: Hotel[];
  hotelFilter?: string;
}

function SidebarContent({
  entries,
  visibleCalendars,
  onToggle,
  onShowAll,
  onHideAll,
  hotels,
  hotelFilter,
}: CalendarSidebarProps) {
  const hasCalendarList = entries.length > 1;
  return (
    <div className="flex flex-col h-full">
      {hasCalendarList && (
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Calendriers
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={onShowAll}
            >
              Tout
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={onHideAll}
            >
              Rien
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2">
        {hasCalendarList && entries.map((entry) => {
          const isChecked = visibleCalendars[entry.id] !== false;
          const typeDef =
            entry.type === "amenity" && entry.amenityType
              ? getAmenityType(entry.amenityType)
              : null;
          const Icon = entry.type === "treatments" ? Stethoscope : typeDef?.icon;

          return (
            <label
              key={entry.id}
              className={cn(
                "flex items-center gap-2.5 px-3 py-1.5 cursor-pointer",
                "hover:bg-foreground/5 transition-colors"
              )}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(checked) =>
                  onToggle(entry.id, checked === true)
                }
                className="h-4 w-4 rounded border-2"
                style={
                  isChecked
                    ? {
                        backgroundColor: entry.color,
                        borderColor: entry.color,
                      }
                    : { borderColor: entry.color }
                }
              />
              {Icon && (
                <Icon
                  className="h-3.5 w-3.5 flex-shrink-0"
                  style={{ color: entry.color }}
                />
              )}
              <span className="text-sm truncate">{entry.label}</span>
            </label>
          );
        })}

        <CalendarLegend
          hotels={hotels}
          hotelFilter={hotelFilter}
          className={hasCalendarList ? "border-t mt-2" : ""}
        />
      </div>
    </div>
  );
}

// Desktop: inline sidebar panel with collapse/expand
export function CalendarSidebarDesktop(props: CalendarSidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  if (collapsed) {
    return (
      <div className="hidden md:flex flex-col w-8 flex-shrink-0 border-r bg-card items-center py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCollapsed(false)}
              aria-label="Ouvrir le panneau"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Afficher la légende</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="hidden md:flex flex-col w-[200px] flex-shrink-0 border-r bg-card relative">
      <div className="absolute top-1 right-1 z-10">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCollapsed(true)}
              aria-label="Fermer le panneau"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Masquer la légende</TooltipContent>
        </Tooltip>
      </div>
      <SidebarContent {...props} />
    </div>
  );
}

// Mobile: Sheet trigger button + drawer
export function CalendarSidebarMobile(props: CalendarSidebarProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8 md:hidden">
          <PanelLeft className="h-3.5 w-3.5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[220px] p-0">
        <SidebarContent {...props} />
      </SheetContent>
    </Sheet>
  );
}

// Helper to build entries from venue amenities
export function buildCalendarEntries(
  venueAmenities: Array<{
    id: string;
    type: string;
    name: string | null;
    color: string;
    is_enabled: boolean;
  }>,
  locale: string
): CalendarEntry[] {
  const entries: CalendarEntry[] = [
    {
      id: "treatments",
      type: "treatments",
      label: locale === "fr" ? "Soins" : "Treatments",
      color: "#3b82f6",
    },
  ];

  for (const va of venueAmenities) {
    if (!va.is_enabled) continue;
    entries.push({
      id: va.id,
      type: "amenity",
      label: va.name || getAmenityLabel(va.type, locale),
      color: va.color,
      amenityType: va.type,
    });
  }

  return entries;
}
