import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Calendar as CalendarIcon, Check, ChevronsUpDown, List, Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Hotel, Therapist } from "@/hooks/booking";

interface BookingFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  hotelFilter: string;
  onHotelChange: (value: string) => void;
  therapistFilter: string;
  onTherapistChange: (value: string) => void;
  view: "calendar" | "list";
  onViewChange: (view: "calendar" | "list") => void;
  dayCount: number;
  onDayCountChange: (count: number) => void;
  isAdmin: boolean;
  hotels: Hotel[] | undefined;
  therapists: Therapist[] | undefined;
  hideHotelFilter?: boolean;
  hideViewToggle?: boolean;
  showAvailability?: boolean;
  onShowAvailabilityChange?: (show: boolean) => void;
  /** Period filter in days (window: [today - N days, future]). Omit to hide the selector. */
  periodDays?: number;
  onPeriodDaysChange?: (days: number) => void;
}

export function BookingFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  hotelFilter,
  onHotelChange,
  therapistFilter,
  onTherapistChange,
  view,
  onViewChange,
  dayCount,
  onDayCountChange,
  isAdmin,
  hotels,
  therapists,
  hideHotelFilter = false,
  hideViewToggle = false,
  showAvailability,
  onShowAvailabilityChange,
  periodDays,
  onPeriodDaysChange,
}: BookingFiltersProps) {
  const { t } = useTranslation("admin");
  const [hotelPopoverOpen, setHotelPopoverOpen] = useState(false);
  const [therapistPopoverOpen, setTherapistPopoverOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Rechercher..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 w-[160px] text-xs"
        />
      </div>

      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Tous les statuts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les statuts</SelectItem>
          <SelectItem value="quote_pending">Devis</SelectItem>
          <SelectItem value="pending">En attente</SelectItem>
          <SelectItem value="confirmed">Confirmé</SelectItem>
          <SelectItem value="ongoing">En cours</SelectItem>
          <SelectItem value="completed">Terminé</SelectItem>
          <SelectItem value="cancelled">Annulé</SelectItem>
        </SelectContent>
      </Select>

      {periodDays !== undefined && onPeriodDaysChange && (
        <Select
          value={String(periodDays)}
          onValueChange={(v) => onPeriodDaysChange(Number(v))}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 derniers jours</SelectItem>
            <SelectItem value="30">30 derniers jours</SelectItem>
            <SelectItem value="60">60 derniers jours</SelectItem>
          </SelectContent>
        </Select>
      )}

      {isAdmin && !hideHotelFilter && (() => {
        const selectedHotel = hotelFilter !== "all" ? hotels?.find(h => h.id === hotelFilter) : null;
        return (
          <Popover open={hotelPopoverOpen} onOpenChange={setHotelPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={hotelPopoverOpen}
                className="w-[160px] h-8 px-2 text-xs font-normal justify-between"
              >
                <div className="flex items-center gap-1.5 truncate">
                  {selectedHotel && (
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: selectedHotel.calendar_color || '#3b82f6' }}
                    />
                  )}
                  <span className="truncate">
                    {selectedHotel ? selectedHotel.name : "Tous les lieux"}
                  </span>
                </div>
                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Rechercher un lieu..." className="h-8 text-xs" />
                <CommandList>
                  <CommandEmpty>Aucun lieu trouvé.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="all tous les lieux"
                      onSelect={() => {
                        onHotelChange("all");
                        setHotelPopoverOpen(false);
                      }}
                      className="text-xs"
                    >
                      <Check className={cn("mr-2 h-3.5 w-3.5", hotelFilter === "all" ? "opacity-100" : "opacity-0")} />
                      Tous les lieux
                    </CommandItem>
                    {hotels?.map((hotel) => (
                      <CommandItem
                        key={hotel.id}
                        value={hotel.name}
                        onSelect={() => {
                          onHotelChange(hotel.id);
                          setHotelPopoverOpen(false);
                        }}
                        className="text-xs"
                      >
                        <Check className={cn("mr-2 h-3.5 w-3.5", hotelFilter === hotel.id ? "opacity-100" : "opacity-0")} />
                        <span
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mr-1.5"
                          style={{ backgroundColor: hotel.calendar_color || '#3b82f6' }}
                        />
                        {hotel.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        );
      })()}

      {isAdmin && (() => {
        const selectedTherapist =
          therapistFilter !== "all" ? therapists?.find(th => th.id === therapistFilter) : null;
        return (
          <Popover open={therapistPopoverOpen} onOpenChange={setTherapistPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={therapistPopoverOpen}
                className="w-[160px] h-8 px-2 text-xs font-normal justify-between"
              >
                <span className="truncate">
                  {selectedTherapist
                    ? `${selectedTherapist.first_name} ${selectedTherapist.last_name}`
                    : "Tous les thérapeutes"}
                </span>
                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Rechercher un thérapeute..." className="h-8 text-xs" />
                <CommandList>
                  <CommandEmpty>Aucun thérapeute trouvé.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="all tous les therapeutes"
                      onSelect={() => {
                        onTherapistChange("all");
                        setTherapistPopoverOpen(false);
                      }}
                      className="text-xs"
                    >
                      <Check className={cn("mr-2 h-3.5 w-3.5", therapistFilter === "all" ? "opacity-100" : "opacity-0")} />
                      Tous les thérapeutes
                    </CommandItem>
                    {therapists?.map((therapist) => (
                      <CommandItem
                        key={therapist.id}
                        value={`${therapist.first_name} ${therapist.last_name}`}
                        onSelect={() => {
                          onTherapistChange(therapist.id);
                          setTherapistPopoverOpen(false);
                        }}
                        className="text-xs"
                      >
                        <Check className={cn("mr-2 h-3.5 w-3.5", therapistFilter === therapist.id ? "opacity-100" : "opacity-0")} />
                        {therapist.first_name} {therapist.last_name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        );
      })()}

      <div className="flex items-center gap-1.5 ml-auto">
        {view === "calendar" && (
          <ButtonGroup>
            {[
              { count: 1, label: "Jour" },
              { count: 3, label: "3j" },
              { count: 7, label: "Semaine" },
            ].map((opt) => (
              <Button
                key={opt.count}
                variant="outline"
                size="sm"
                onClick={() => onDayCountChange(opt.count)}
                className={cn(
                  "h-8 px-2.5 text-xs",
                  dayCount === opt.count
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                    : "text-muted-foreground"
                )}
              >
                {opt.label}
              </Button>
            ))}
          </ButtonGroup>
        )}

        {onShowAvailabilityChange && view === "calendar" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onShowAvailabilityChange(!showAvailability)}
                className={cn(
                  "h-8 w-8",
                  showAvailability
                    ? "bg-emerald-50 border-emerald-300 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                    : "text-muted-foreground"
                )}
              >
                <Users className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showAvailability ? t("planning.hideAvailability") : t("planning.showAvailability")}
            </TooltipContent>
          </Tooltip>
        )}

        {!hideViewToggle && (
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onViewChange("calendar")}
                  className={`h-8 w-8 ${view === "calendar" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Calendrier</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onViewChange("list")}
                  className={`h-8 w-8 ${view === "list" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Liste</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        )}
      </div>
    </div>
  );
}
