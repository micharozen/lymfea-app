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
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Calendar as CalendarIcon, List, Search, Users } from "lucide-react";
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
  showAvailability?: boolean;
  onShowAvailabilityChange?: (show: boolean) => void;
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
  showAvailability,
  onShowAvailabilityChange,
}: BookingFiltersProps) {
  const { t } = useTranslation("admin");
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

      {isAdmin && !hideHotelFilter && (() => {
        const selectedHotel = hotelFilter !== "all" ? hotels?.find(h => h.id === hotelFilter) : null;
        return (
          <Select value={hotelFilter} onValueChange={onHotelChange}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <div className="flex items-center gap-1.5 truncate">
                {selectedHotel && (
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: selectedHotel.calendar_color || '#3b82f6' }}
                  />
                )}
                <SelectValue placeholder="Tous les lieux" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les lieux</SelectItem>
              {hotels?.map((hotel) => (
                <SelectItem key={hotel.id} value={hotel.id}>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: hotel.calendar_color || '#3b82f6' }}
                    />
                    {hotel.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })()}

      {isAdmin && (
        <Select value={therapistFilter} onValueChange={onTherapistChange}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Thérapeutes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les thérapeutes</SelectItem>
            {therapists?.map((therapist) => (
              <SelectItem key={therapist.id} value={therapist.id}>
                {therapist.first_name} {therapist.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-1.5 ml-auto">
        {view === "calendar" && (
          <Select value={String(dayCount)} onValueChange={(v) => onDayCountChange(Number(v))}>
            <SelectTrigger className="w-[90px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 jour</SelectItem>
              <SelectItem value="2">2 jours</SelectItem>
              <SelectItem value="3">3 jours</SelectItem>
              <SelectItem value="5">5 jours</SelectItem>
              <SelectItem value="7">Semaine</SelectItem>
            </SelectContent>
          </Select>
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
      </div>
    </div>
  );
}
